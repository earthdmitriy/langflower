import { describe, expect, it } from 'vitest';
import {
	createExecutionFeedHarness,
	outputEvent,
	paletteDefinition,
	readItems,
	runId,
	startRun,
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

		harness.seedCatalog({ 'agent-a': 'agent' }, [agent], { startRun: false });

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
		harness.seedCatalog({ 'agent-a': 'agent' }, [agent], { startRun: false });
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
		harness.seedCatalog({ 'agent-a': 'agent' }, [agent], {
			startRun: false,
		});
		startRun(harness, 'run-1');
		harness.raw.runnerPort$.next(
			outputEvent('agent-a', 'draft', 'one'),
		);
		const run1VisitId = harness.latestNodes()[0]?.visitId;

		startRun(harness, 'run-2');
		harness.raw.runnerPort$.next(
			outputEvent('agent-a', 'draft', 'two'),
		);
		const run2Node = harness.latestNodes()[0]!;

		expect(run1VisitId).toMatch(/^run-1:agent-a:/);
		expect(run2Node.runId).toBe('run-2');
		expect(run2Node.visitId).toMatch(/^run-2:agent-a:/);
		expect(run2Node.visitId).not.toBe(run1VisitId);
	});
});
