import { describe, expect, it } from 'vitest';
import {
	createExecutionFeedHarness,
	outputEvent,
	paletteDefinition,
	readItems,
	runId,
} from './execution-feed.service.fixture';

const agent = paletteDefinition('agent', [
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
]);

describe('ExecutionFeedService replay', () => {
	it('retains an early bridge snapshot until workflow and palette arrive', async () => {
		const harness = createExecutionFeedHarness();
		harness.raw.executionFeedSnapshot$.next({
			runId: runId(),
			workflowId: 'wf-1',
			status: 'running',
			events: [outputEvent('agent-a', 'draft', 'early')],
		});

		expect(harness.latestNodes()).toEqual([]);

		harness.seedCatalog({ 'agent-a': 'agent' }, [agent]);

		expect(harness.latestNodes().map((node) => node.nodeId)).toEqual([
			'agent-a',
		]);
		expect(
			(await readItems(harness.latestNodes()[0]!, 'draft')).map(
				(item) => item.value,
			),
		).toEqual(['early']);
	});

	it('replaces history from snapshots and clears it on null', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ 'agent-a': 'agent' }, [agent]);
		harness.raw.executionFeedSnapshot$.next({
			runId: runId(),
			workflowId: 'wf-1',
			status: 'completed',
			events: [outputEvent('agent-a', 'draft', 'first')],
		});
		harness.raw.executionFeedSnapshot$.next({
			runId: runId(),
			workflowId: 'wf-1',
			status: 'completed',
			events: [outputEvent('agent-a', 'draft', 'replacement')],
		});

		expect(
			(await readItems(harness.latestNodes()[0]!, 'draft')).map(
				(item) => item.value,
			),
		).toEqual(['replacement']);

		harness.raw.executionFeedSnapshot$.next(null);
		expect(harness.latestNodes()).toEqual([]);
	});

	it('keeps the same graph node in different runs separate', () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ 'agent-a': 'agent' }, [agent]);
		harness.raw.outputEmitted$.next(
			outputEvent('agent-a', 'draft', 'one', { run: 'run-1' }),
		);
		harness.raw.outputEmitted$.next(
			outputEvent('agent-a', 'draft', 'two', { run: 'run-2' }),
		);

		expect(harness.latestNodes().map((node) => node.runId)).toEqual([
			'run-1',
			'run-2',
		]);
	});
});
