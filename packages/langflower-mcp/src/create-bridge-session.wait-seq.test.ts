// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { createBridgeSession } from './create-bridge-session.js';

type MockClient = {
	readonly status$: Subject<string>;
	readonly close: ReturnType<typeof vi.fn>;
	readonly channels: Map<string, Subject<unknown>>;
};

const harness = vi.hoisted(() => ({
	mockClient: undefined as MockClient | undefined,
}));

vi.mock('@langflower/websocket-bridge/create-client', () => ({
	createClient: () => {
		const channels = new Map<string, Subject<unknown>>();
		const channel = (key: string): Subject<unknown> => {
			let subject = channels.get(key);
			if (subject === undefined) {
				subject = new Subject<unknown>();
				channels.set(key, subject);
			}
			return subject;
		};
		const status$ = new Subject<string>();
		const mockClient: MockClient = {
			status$,
			close: vi.fn(),
			channels,
		};
		harness.mockClient = mockClient;
		return new Proxy(mockClient, {
			get(target, prop: string | symbol) {
				if (typeof prop === 'string' && prop.includes('.')) {
					return channel(prop);
				}
				return Reflect.get(target, prop);
			},
		});
	},
}));

describe('createBridgeSession waitForEventSeq', () => {
	let session: ReturnType<typeof createBridgeSession>;

	beforeEach(async () => {
		session = createBridgeSession({
			wsUrl: 'ws://127.0.0.1:4010/ws',
		});
		const ready = session.ensureReady();
		await Promise.resolve();
		const mock = harness.mockClient;
		if (mock === undefined) {
			throw new Error('expected createClient mock');
		}
		mock.status$.next('connected');
		mock.channels.get('session.ready')?.next({ ok: true });
		await ready;
	});

	afterEach(() => {
		session.close();
	});

	it('resolves the next frame via seqAdvanced$ (no interval poll)', async () => {
		const mock = harness.mockClient;
		if (mock === undefined) {
			throw new Error('expected createClient mock');
		}
		const seqBefore = session.getEventSeq('workflow.list.snapshot');
		const waiting = session.waitForEventSeq(
			'workflow.list.snapshot',
			seqBefore,
			2_000,
		);

		mock.channels
			.get('workflow.list.snapshot')
			?.next({ workflows: [{ id: 'a' }] });

		await expect(waiting).resolves.toEqual({
			workflows: [{ id: 'a' }],
		});
		expect(session.getEventSeq('workflow.list.snapshot')).toBe(
			seqBefore + 1,
		);
	});

	it('returns immediately when seq already advanced', async () => {
		const mock = harness.mockClient;
		if (mock === undefined) {
			throw new Error('expected createClient mock');
		}
		mock.channels
			.get('workflow.list.snapshot')
			?.next({ workflows: [{ id: 'cached' }] });
		const seq = session.getEventSeq('workflow.list.snapshot');
		await expect(
			session.waitForEventSeq('workflow.list.snapshot', seq - 1, 2_000),
		).resolves.toEqual({ workflows: [{ id: 'cached' }] });
	});
});
