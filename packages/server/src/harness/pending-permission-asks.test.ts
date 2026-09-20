import { describe, expect, it } from 'vitest';
import { PendingPermissionAsks } from './pending-permission-asks.js';

const request = {
	toolId: 'read',
	detail: 'notes.md',
	summary: 'Allow read: notes.md?',
} as const;

describe('PendingPermissionAsks', () => {
	it('resolves allow from reply without emitting accepted (wire does)', async () => {
		const asks = new PendingPermissionAsks();
		const accepted: string[] = [];
		const pending = asks.requestPermission(
			'run-1',
			'node-1',
			request,
			() => undefined,
			(payload) => {
				accepted.push(payload.decision);
			},
		);

		expect(asks.list()).toHaveLength(1);
		expect(
			asks.reply({
				runId: 'run-1',
				askId: asks.list()[0]!.askId,
				decision: 'allow',
			}),
		).toBe(true);
		await expect(pending).resolves.toBe('allow');
		expect(asks.list()).toHaveLength(0);
		expect(accepted).toEqual([]);
	});

	it('abort dismisses the ask, denies, and emits accepted', async () => {
		const asks = new PendingPermissionAsks();
		const accepted: Array<{
			readonly askId: string;
			readonly decision: string;
		}> = [];
		const signal = new AbortController();
		const pending = asks.requestPermission(
			'run-1',
			'node-1',
			request,
			() => undefined,
			(payload) => {
				accepted.push({
					askId: payload.askId,
					decision: payload.decision,
				});
			},
			signal.signal,
		);

		const askId = asks.list()[0]!.askId;
		signal.abort();
		await expect(pending).resolves.toBe('deny');
		expect(asks.list()).toHaveLength(0);
		expect(accepted).toEqual([{ askId, decision: 'deny' }]);
		expect(asks.reply({ runId: 'run-1', askId, decision: 'allow' })).toBe(
			false,
		);
	});

	it('already-aborted signal settles immediately', async () => {
		const asks = new PendingPermissionAsks();
		const signal = new AbortController();
		signal.abort();
		const pending = asks.requestPermission(
			'run-1',
			'node-1',
			request,
			() => undefined,
			undefined,
			signal.signal,
		);

		await expect(pending).resolves.toBe('deny');
		expect(asks.list()).toHaveLength(0);
	});
});
