import { describe, expect, it } from 'vitest';
import type { RunId } from '@langflower/runtime';
import type { WorkflowLoadedPayload } from '@langflower/shared/langflower.js';
import { RunCheckpointSession } from './run-checkpoint-session.js';

const emptyWorkflow = (id: string): WorkflowLoadedPayload =>
	({
		workflowId: id,
		metadata: {
			name: id,
			createdAt: '2026-07-19T00:00:00.000Z',
			updatedAt: '2026-07-19T00:00:00.000Z',
		},
		graph: {
			viewport: { x: 0, y: 0, scale: 1, width: 800, height: 600 },
			nodes: [],
			edges: [],
		},
	}) as WorkflowLoadedPayload;

describe('RunCheckpointSession explicit boundaries', () => {
	it('does not persist Stop without a checkpoint boundary', async () => {
		const session = new RunCheckpointSession(process.cwd());
		session.beginRun('run-1' as RunId, emptyWorkflow('wf'));

		session.observe({
			kind: 'output-emitted',
			runId: 'run-1' as RunId,
			nodeId: 'stage-a',
			portId: 'value',
			portIdx: 0,
			edgeIds: [],
			state: 'value',
			value: 'ok',
		});

		await expect(session.markStopped()).resolves.toBeUndefined();
	});

	it('persists when an explicit boundary is observed', async () => {
		const session = new RunCheckpointSession(process.cwd());
		session.beginRun('run-boundary' as RunId, emptyWorkflow('wf'));

		const shouldPersist = session.observe(
			{
				kind: 'output-emitted',
				runId: 'run-boundary' as RunId,
				nodeId: 'checkpoint-a',
				portId: 'value',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'ok',
			},
			{ label: 'After stage A' },
		);

		expect(shouldPersist).toBe(true);

		const summary = await session.persist('running');
		expect(summary).toMatchObject({
			runId: 'run-boundary',
			workflowId: 'wf',
			status: 'running',
			label: 'After stage A',
			completedNodeIds: ['checkpoint-a'],
		});

		await session.getStore().discard('wf', 'run-boundary');
	});
});
