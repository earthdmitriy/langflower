import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';
import type { NodeFeedItem, PortStreamItem } from '../types';
import {
	createExecutionFeedHarness,
	inputEvent,
	outputEvent,
	paletteDefinition,
	readItems,
} from './execution-feed.service.fixture';

const review = paletteDefinition('review', [
	{ portId: 'result', direction: 'in' },
	{
		portId: 'recovery',
		direction: 'out',
		role: 'recovery',
		streaming: true,
	},
	{
		portId: 'reasoning',
		direction: 'out',
		role: 'reasoning',
		streaming: true,
	},
]);

const retryNotice = (
	reason: 'idle' | 'dead-loop',
	extra: { readonly lastAttemptAt?: number } = {},
) => ({
	code: 'retry' as const,
	text: `retry ${reason}`,
	attempt: 1,
	reason,
	nextAttemptAt: 1_700_000_000_000,
	...extra,
});

const readPin = async (
	node: NodeFeedItem,
): Promise<PortStreamItem | undefined> =>
	firstValueFrom(node.pinnedRecovery.pipe(take(1)));

describe('ExecutionFeedService recovery pin', () => {
	it('clears the live timer when reasoning follows recovery', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ review: 'review' }, [review]);

		harness.raw.runnerPort$.next(
			outputEvent(
				'review',
				'recovery',
				retryNotice('idle', { lastAttemptAt: 1_699_999_833_000 }),
			),
		);
		harness.raw.runnerPort$.next(
			inputEvent(
				'review',
				'result',
				'Reasoning: The user has provided a revised SDXL prompt.',
			),
		);
		expect(await readPin(harness.latestNodes()[0]!)).toMatchObject({
			value: { reason: 'idle', attempt: 1 },
		});
		harness.raw.runnerPort$.next(
			outputEvent('review', 'recovery', retryNotice('dead-loop')),
		);

		expect(await readPin(harness.latestNodes()[0]!)).toMatchObject({
			value: { reason: 'dead-loop', attempt: 1 },
		});

		harness.raw.runnerPort$.next(
			outputEvent('review', 'reasoning', 'This suggests I might have'),
		);

		const visits = harness.latestNodes();
		expect(visits).toHaveLength(1);
		expect(visits[0]?.isClosed).toBe(false);
		expect(await readPin(visits[0]!)).toBeUndefined();

		const recoveryRows = await readItems(visits[0]!, 'recovery');
		expect(recoveryRows.map((item) => item.value)).toEqual([
			expect.objectContaining({ reason: 'idle' }),
			expect.objectContaining({ reason: 'dead-loop' }),
		]);
	});

	it('updates a held pin selector when a later recovery arrives', () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ review: 'review' }, [review]);
		harness.raw.runnerPort$.next(
			outputEvent('review', 'recovery', retryNotice('idle')),
		);

		const held = harness.latestNodes()[0]!;
		const seen: unknown[] = [];
		const sub = held.pinnedRecovery.subscribe((item) => {
			seen.push(
				item !== undefined &&
					typeof item.value === 'object' &&
					item.value !== null &&
					'reason' in item.value
					? item.value.reason
					: item,
			);
		});

		harness.raw.runnerPort$.next(
			inputEvent('review', 'result', 'artifact'),
		);
		expect(seen.at(-1)).toBe('idle');
		harness.raw.runnerPort$.next(
			outputEvent('review', 'reasoning', 'continuing'),
		);
		expect(seen.at(-1)).toBeUndefined();
		harness.raw.runnerPort$.next(
			outputEvent('review', 'recovery', retryNotice('dead-loop')),
		);

		expect(seen.at(-1)).toBe('dead-loop');
		sub.unsubscribe();
	});
});
