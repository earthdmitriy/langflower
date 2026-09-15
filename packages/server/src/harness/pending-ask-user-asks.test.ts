import { describe, expect, it } from 'vitest';
import { PendingAskUserAsks } from './pending-ask-user-asks.js';

describe('PendingAskUserAsks', () => {
	it('resolves with trimmed operator text', async () => {
		const asks = new PendingAskUserAsks();
		const emitted: string[] = [];
		const pending = asks.requestAskUser(
			'run-1',
			'node-1',
			{ question: 'Name?' },
			(payload) => {
				emitted.push(payload.question);
			},
		);

		expect(asks.list()).toHaveLength(1);
		expect(emitted).toEqual(['Name?']);
		expect(
			asks.reply({
				runId: 'run-1',
				askId: asks.list()[0]!.askId,
				text: '  Langflower  ',
			}),
		).toBe(true);
		await expect(pending).resolves.toBe('Langflower');
		expect(asks.list()).toHaveLength(0);
	});

	it('rejects empty replies and failAll aborts waiters', async () => {
		const asks = new PendingAskUserAsks();
		const pending = asks.requestAskUser(
			'run-1',
			'node-1',
			{ question: 'Name?' },
			() => undefined,
		);
		const askId = asks.list()[0]!.askId;

		expect(asks.reply({ runId: 'run-1', askId, text: '   ' })).toBe(false);
		asks.failAll('run-1');
		await expect(pending).rejects.toThrow(/aborted/i);
		expect(asks.list()).toHaveLength(0);
	});
});
