import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
	WsBridgeError,
	WsBridgeStatus,
} from '@langflower/websocket-bridge';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
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

describe('attachBridgeEventLog', () => {
	it('records inbound, broadcast, unicast, lifecycle, and error records with secrets redacted', async () => {
		const projectDir = await createTemporaryProject();
		const inbound = new Subject<{
			readonly clientId: string;
			readonly payload: unknown;
		}>();
		const broadcast = new Subject<unknown>();
		const connections = new Subject<LangflowerClient>();
		const status = new BehaviorSubject<WsBridgeStatus>('connecting');
		const errors = new Subject<WsBridgeError>();
		const rootSubscription = new Subscription();
		const log = attachBridgeEventLog(
			asBridge({
				'langflower.config.save.requested': inbound,
				'workflow.current.snapshot': broadcast,
				connections$: connections,
				status$: status,
				errors$: errors,
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
			payload: {
				providerApiKeys: { openai: 'never-write-this' },
				ordinary: 'retained',
			},
		});
		broadcast.next({ token: 'never-write-this-either' });
		connections.next(client);
		unicast.next({ apiKey: 'also-not-written', value: 'snapshot' });
		disconnected.next();
		status.next('connected');
		errors.next({
			code: 'INVALID_FRAME',
			message: 'Malformed input',
			cause: new Error('frame detail'),
		});

		log.writeServerClosing();
		rootSubscription.unsubscribe();
		await log.flush();

		const text = await fs.readFile(log.filePath, 'utf8');
		const records = text
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as Record<string, unknown>);

		expect(log.filePath).toMatch(/\.langflower[\\/]logs[\\/].+\.log$/);
		expect(records).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'frame',
					direction: 'inbound',
					clientId: 'client-1',
					type: 'langflower.config.save.requested',
				}),
				expect.objectContaining({
					kind: 'frame',
					direction: 'outbound',
					scope: 'broadcast',
					type: 'workflow.current.snapshot',
				}),
				expect.objectContaining({
					kind: 'frame',
					direction: 'outbound',
					scope: 'client',
					clientId: 'client-1',
					type: 'workflow.current.snapshot',
				}),
				expect.objectContaining({
					kind: 'connection',
					clientId: 'client-1',
				}),
				expect.objectContaining({
					kind: 'disconnection',
					clientId: 'client-1',
				}),
				expect.objectContaining({
					kind: 'status',
					status: 'connected',
				}),
				expect.objectContaining({
					kind: 'error',
					error: expect.objectContaining({ code: 'INVALID_FRAME' }),
				}),
				expect.objectContaining({ kind: 'server-closing' }),
			]),
		);
		expect(text).not.toContain('never-write-this');
		expect(text).not.toContain('also-not-written');
		expect(text).toContain('[REDACTED]');
	});

	it('reports a directory failure once without throwing from bridge event handling', async () => {
		const projectDir = await createTemporaryProject();
		await fs.writeFile(
			path.join(projectDir, '.langflower'),
			'not a directory',
		);
		const rootSubscription = new Subscription();
		const stderr = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
		const log = attachBridgeEventLog(
			asBridge({
				connections$: new Subject<LangflowerClient>(),
				status$: new Subject<WsBridgeStatus>(),
				errors$: new Subject<WsBridgeError>(),
			}),
			projectDir,
			rootSubscription,
		);

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
		const status = new Subject<WsBridgeStatus>();
		const rootSubscription = new Subscription();
		const log = attachBridgeEventLog(
			asBridge({
				connections$: new Subject<LangflowerClient>(),
				status$: status,
				errors$: new Subject<WsBridgeError>(),
			}),
			projectDir,
			rootSubscription,
			{ enabled: false },
		);

		status.next('connected');
		await log.flush();
		await expect(fs.access(log.filePath)).rejects.toMatchObject({
			code: 'ENOENT',
		});

		log.setEnabled(true);
		status.next('disconnected');
		log.writeServerClosing();
		rootSubscription.unsubscribe();
		await log.flush();

		const text = await fs.readFile(log.filePath, 'utf8');
		expect(text).toContain('"kind":"status"');
		expect(text).toContain('"status":"disconnected"');
		expect(text).not.toContain('"status":"connected"');
		expect(text).toContain('"kind":"server-closing"');
	});
});
