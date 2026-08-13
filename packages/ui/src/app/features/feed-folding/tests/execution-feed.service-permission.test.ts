import { describe, expect, it } from 'vitest';
import {
	createExecutionFeedHarness,
	outputEvent,
	paletteDefinition,
	readItems,
} from './execution-feed.service.fixture';

const agent = paletteDefinition('agent', [
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
]);

describe('ExecutionFeedService permissions', () => {
	it.each([
		['allow', 'permission-grant'],
		['deny', 'permission-deny'],
	] as const)(
		'correlates ask with accepted %s',
		async (decision, presentation) => {
			const harness = createExecutionFeedHarness();
			harness.seedCatalog({ agent: 'agent' }, [agent]);
			const ask = {
				runId: 'run-1',
				askId: `ask-${decision}`,
				nodeId: 'agent',
				toolId: 'shell',
				detail: 'command',
				summary: 'Run command',
			};

			harness.raw.permissionAsk$.next(ask);
			harness.raw.permissionAccepted$.next({
				runId: ask.runId,
				askId: ask.askId,
				decision,
			});

			const items = await readItems(
				harness.latestNodes()[0]!,
				`permission:${ask.askId}`,
			);
			expect(items.map((item) => item.meta)).toEqual([
				{
					presentation: 'permission-ask',
					askId: ask.askId,
					authority: 'server',
				},
				{
					presentation,
					askId: ask.askId,
					authority: 'server',
				},
			]);
		},
	);

	it('keeps permission decisions isolated from concurrent draft output', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'draft', 'before'),
		);
		harness.raw.permissionAsk$.next({
			runId: 'run-1',
			askId: 'ask-1',
			nodeId: 'agent',
			toolId: 'shell',
			detail: 'command',
			summary: 'Run command',
		});
		harness.raw.runnerPort$.next(outputEvent('agent', 'draft', 'after'));

		// Permission port interrupts the draft segment; later draft is a new segment.
		expect(
			(await readItems(harness.latestNodes()[0]!, 'draft')).map(
				(item) => [item.value, item.seq],
			),
		).toEqual([
			['before', 0],
			['after', 2],
		]);
	});
});
