import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunProgressAccumulator } from '../checkpoint/run-progress-accumulator.js';
import type { ServerContext } from '../server-context.js';
import { LangflowerSession } from '../session/langflower-session.js';
import { WorkflowSessionAutosave } from '../workflow-sessions/workflow-session-autosave.js';
import { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';
import { indexClient } from './client-index.js';
import type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';
import { wireRunnerHandlers } from './wire-runner-handlers.js';

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) =>
				fs.rm(directory, { recursive: true, force: true }),
			),
	);
});

describe('wireRunnerHandlers interrupt', () => {
	it('emits runner.interrupted after the session head flush resolves', async () => {
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-interrupt-'),
		);
		directories.push(projectDir);
		const subjects = new Map<string, Subject<unknown>>();
		const bridge = new Proxy(
			{},
			{
				get: (_target, property) => {
					if (typeof property !== 'string') {
						return undefined;
					}

					const existing = subjects.get(property);

					if (existing !== undefined) {
						return existing;
					}

					const created = new Subject<unknown>();
					subjects.set(property, created);
					return created;
				},
			},
		) as unknown as LangflowerBridge;
		const client = { id: 'c1' } as unknown as LangflowerClient;
		indexClient(bridge, client);

		const session = new LangflowerSession();
		const store = new WorkflowSessionStore(projectDir);
		const autosave = new WorkflowSessionAutosave(session, store);
		const order: string[] = [];
		const interrupted$ = new Subject<unknown>();
		subjects.set('runner.interrupted', interrupted$);
		interrupted$.subscribe(() => {
			order.push('emitted');
		});
		let releaseFlush: () => void = () => undefined;
		const flushGate = new Promise<void>((resolve) => {
			releaseFlush = resolve;
		});
		const progress = {
			clearActive: () => undefined,
		} as RunProgressAccumulator;
		const subscription = wireRunnerHandlers(
			bridge,
			{} as ServerContext,
			session,
			progress,
			store,
			autosave,
			() => {
				order.push('flush-start');
				return flushGate.then(() => {
					order.push('flush-end');
				});
			},
		);
		subjects.get('runner.interrupt.requested')?.next({
			clientId: 'c1',
			payload: 'cancel',
		});

		await vi.waitFor(() => {
			expect(order).toEqual(['flush-start']);
		});
		releaseFlush();
		await vi.waitFor(() => {
			expect(order).toEqual(['flush-start', 'flush-end', 'emitted']);
		});
		subscription.unsubscribe();
	});
});
