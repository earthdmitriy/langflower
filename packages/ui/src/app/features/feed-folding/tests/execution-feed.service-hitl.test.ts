import { describe, expect, it } from 'vitest';
import {
	createExecutionFeedHarness,
	inputEvent,
	outputEvent,
	paletteDefinition,
	readItems,
} from './execution-feed.service.fixture';

const review = paletteDefinition('review', [
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
	{ portId: 'reply', direction: 'in', hitl: true },
]);

describe('ExecutionFeedService HITL', () => {
	it('preserves output, human reply, and resumed output chronology', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ review: 'review' }, [review]);

		harness.raw.runnerPort$.next(outputEvent('review', 'draft', 'before'));
		harness.raw.runnerPort$.next(inputEvent('review', 'reply', 'continue'));
		harness.raw.runnerPort$.next(outputEvent('review', 'draft', 'after'));

		const visits = harness.latestNodes();
		// Same-node while-last: reply closes, resumed draft reopens the same card.
		expect(visits).toHaveLength(1);
		expect(
			(await readItems(visits[0]!, 'draft')).map((item) => [
				item.value,
				item.seq,
			]),
		).toEqual([
			['before', 0],
			['after', 2],
		]);
		expect(await readItems(visits[0]!, 'reply')).toEqual([
			expect.objectContaining({
				value: 'continue',
				seq: 1,
				meta: expect.objectContaining({
					presentation: 'hitl-user',
					origin: 'hitl-reply',
					visitBoundary: 'close',
				}),
			}),
		]);
	});

	it('keeps replies isolated across parallel HITL nodes', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ left: 'review', right: 'review' }, [review]);
		harness.raw.runnerPort$.next(outputEvent('left', 'draft', 'L'));
		harness.raw.runnerPort$.next(outputEvent('right', 'draft', 'R'));
		harness.raw.runnerPort$.next(inputEvent('left', 'reply', 'left only'));

		const [left, right] = harness.latestNodes();
		expect((await readItems(left!, 'reply'))[0]?.value).toBe('left only');
		expect(await readItems(right!, 'reply')).toEqual([]);
	});
});
