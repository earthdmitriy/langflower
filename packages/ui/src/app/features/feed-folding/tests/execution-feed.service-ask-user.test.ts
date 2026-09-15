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

describe('ExecutionFeedService ask_user', () => {
	it('correlates ask with accepted reply text', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		const ask = {
			runId: 'run-1',
			askId: 'ask-1',
			nodeId: 'agent',
			question: 'What is the project name?',
		};

		harness.raw.askUserAsk$.next(ask);
		harness.raw.askUserAccepted$.next({
			runId: ask.runId,
			askId: ask.askId,
			text: 'Langflower',
		});

		const items = await readItems(
			harness.latestNodes()[0]!,
			`askUser:${ask.askId}`,
		);
		expect(items.map((item) => [item.meta, item.value])).toEqual([
			[
				{
					presentation: 'ask-user-ask',
					askId: ask.askId,
					authority: 'server',
				},
				ask.question,
			],
			[
				{
					presentation: 'ask-user-reply',
					askId: ask.askId,
					authority: 'server',
				},
				'Langflower',
			],
		]);
	});

	it('keeps ask_user turns isolated from concurrent draft output', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(outputEvent('agent', 'draft', 'before'));
		harness.raw.askUserAsk$.next({
			runId: 'run-1',
			askId: 'ask-1',
			nodeId: 'agent',
			question: 'Scope?',
		});
		harness.raw.runnerPort$.next(outputEvent('agent', 'draft', 'after'));

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
