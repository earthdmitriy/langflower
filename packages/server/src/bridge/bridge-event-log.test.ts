import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Subject, Subscription } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachBridgeEventLog } from './bridge-event-log.js';
import type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';

const temporaryDirectories: string[] = [];

const createTemporaryProject = async (): Promise<string> => {
	const projectDir = await fs.mkdtemp(
		path.join(os.tmpdir(), 'langflower-log-'),
	);
	temporaryDirectories.push(projectDir);
	return projectDir;
};

const asBridge = (value: Record<string, unknown>): LangflowerBridge =>
	value as unknown as LangflowerBridge;

const asClient = (value: Record<string, unknown>): LangflowerClient =>
	value as unknown as LangflowerClient;

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) =>
				fs.rm(directory, { recursive: true, force: true }),
			),
	);
});

const parseFrames = (
	text: string,
): ReadonlyArray<readonly [string, 'in' | 'out', string, unknown]> =>
	text
		.trim()
		.split('\n')
		.filter((line) => line.length > 0)
		.map(
			(line) =>
				JSON.parse(line) as readonly [
					string,
					'in' | 'out',
					string,
					unknown,
				],
		);

describe('attachBridgeEventLog', () => {
	it('records inbound, broadcast, and unicast BridgeFrame tuples', async () => {
		const projectDir = await createTemporaryProject();
		const inbound = new Subject<{
			readonly clientId: string;
			readonly payload: unknown;
		}>();
		const broadcast = new Subject<unknown>();
		const connections = new Subject<LangflowerClient>();
		const rootSubscription = new Subscription();
		const log = attachBridgeEventLog(
			asBridge({
				'langflower.config.save.requested': inbound,
				'workflow.current.snapshot': broadcast,
				connections$: connections,
			}),
			projectDir,
			rootSubscription,
		);
		const disconnected = new Subject<void>();
		const unicast = new Subject<unknown>();
		const client = asClient({
			id: 'client-1',
			disconnected$: disconnected,
			'workflow.current.snapshot': unicast,
		});

		inbound.next({
			clientId: 'client-1',
			payload: { ordinary: 'retained' },
		});
		broadcast.next({ marker: 'broadcast-payload' });
		connections.next(client);
		unicast.next({ value: 'snapshot' });
		disconnected.next();

		log.writeServerClosing();
		rootSubscription.unsubscribe();
		await log.flush();

		const text = await fs.readFile(log.filePath, 'utf8');
		const frames = parseFrames(text);

		expect(log.filePath).toMatch(/\.langflower[\\/]logs[\\/].+\.log$/);
		expect(frames).toEqual(
			expect.arrayContaining([
				[
					expect.any(String),
					'in',
					'langflower.config.save.requested',
					{ ordinary: 'retained' },
				],
				[
					expect.any(String),
					'out',
					'workflow.current.snapshot',
					{ marker: 'broadcast-payload' },
				],
				[
					expect.any(String),
					'out',
					'workflow.current.snapshot',
					{ value: 'snapshot' },
				],
			]),
		);
		expect(frames.every((frame) => frame.length === 4)).toBe(true);
	});

	it('reports a directory failure once without throwing from bridge event handling', async () => {
		const projectDir = await createTemporaryProject();
		await fs.writeFile(
			path.join(projectDir, '.langflower'),
			'not a directory',
		);
		const broadcast = new Subject<unknown>();
		const rootSubscription = new Subscription();
		const stderr = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
		const log = attachBridgeEventLog(
			asBridge({
				connections$: new Subject<LangflowerClient>(),
				'workflow.current.snapshot': broadcast,
			}),
			projectDir,
			rootSubscription,
		);

		broadcast.next({ probe: true });
		log.writeServerClosing();
		rootSubscription.unsubscribe();
		await expect(log.flush()).resolves.toBeUndefined();

		expect(stderr).toHaveBeenCalledTimes(1);
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining('Langflower diagnostic logging disabled'),
		);
		stderr.mockRestore();
	});

	it('skips writes while disabled and resumes when re-enabled', async () => {
		const projectDir = await createTemporaryProject();
		const broadcast = new Subject<unknown>();
		const rootSubscription = new Subscription();
		const log = attachBridgeEventLog(
			asBridge({
				connections$: new Subject<LangflowerClient>(),
				'workflow.current.snapshot': broadcast,
			}),
			projectDir,
			rootSubscription,
			{ enabled: false },
		);

		broadcast.next({ first: true });
		await log.flush();
		await expect(fs.access(log.filePath)).rejects.toMatchObject({
			code: 'ENOENT',
		});

		log.setEnabled(true);
		broadcast.next({ second: true });
		log.writeServerClosing();
		rootSubscription.unsubscribe();
		await log.flush();

		const text = await fs.readFile(log.filePath, 'utf8');
		const frames = parseFrames(text);
		expect(frames).toHaveLength(1);
		expect(frames[0]).toEqual([
			expect.any(String),
			'out',
			'workflow.current.snapshot',
			{ second: true },
		]);
	});

	it('logs secrets save as REDACTED and keeps token on other events', async () => {
		const projectDir = await createTemporaryProject();
		const secretsInbound = new Subject<{
			readonly clientId: string;
			readonly payload: unknown;
		}>();
		const snapshot = new Subject<unknown>();
		const saveInbound = new Subject<{
			readonly clientId: string;
			readonly payload: unknown;
		}>();
		const rootSubscription = new Subscription();
		const log = attachBridgeEventLog(
			asBridge({
				'langflower.secrets.save.requested': secretsInbound,
				'langflower.config.save.requested': saveInbound,
				'workflow.current.snapshot': snapshot,
				connections$: new Subject<LangflowerClient>(),
			}),
			projectDir,
			rootSubscription,
		);

		secretsInbound.next({
			clientId: 'client-1',
			payload: {
				secretIds: ['API_TOKEN'],
				secretValues: { API_TOKEN: 'sk-live-secret' },
			},
		});
		saveInbound.next({
			clientId: 'client-1',
			payload: {
				scope: 'global',
				providerApiKeys: { openai: 'sk-openai' },
			},
		});
		snapshot.next({ token: 'broadcast-payload' });

		log.writeServerClosing();
		rootSubscription.unsubscribe();
		await log.flush();

		const text = await fs.readFile(log.filePath, 'utf8');
		const frames = parseFrames(text);
		expect(text).not.toContain('sk-live-secret');
		expect(text).not.toContain('sk-openai');
		expect(frames).toEqual(
			expect.arrayContaining([
				[
					expect.any(String),
					'in',
					'langflower.secrets.save.requested',
					'REDACTED',
				],
				[
					expect.any(String),
					'in',
					'langflower.config.save.requested',
					{
						scope: 'global',
						providerApiKeys: 'REDACTED',
					},
				],
				[
					expect.any(String),
					'out',
					'workflow.current.snapshot',
					{ token: 'broadcast-payload' },
				],
			]),
		);
	});
});
