import type { NodeId, RunId } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap';
import { describe, expect, it } from 'vitest';
import { foldLivenessState } from '../execution-liveness-fold.js';

const empty = {
	map: new Map<string, number>(),
	runId: null,
};

const snapshotWithOut = (runId: string): ExecutionFeedSnapshotPayload => ({
	runId: runId as RunId,
	workflowId: 'w1',
	status: 'running',
	events: [['out', 'n1' as NodeId, 'out', { value: 1 }, 0, [], null]],
});

describe('foldLivenessState', () => {
	it('keeps snapshot stamps on same-runId started', () => {
		const afterSnapshot = foldLivenessState(empty, {
			type: 'snapshot',
			snap: snapshotWithOut('r1'),
			atMs: 1000,
		});
		expect(afterSnapshot.runId).toBe('r1');
		expect(afterSnapshot.map.get('n1')).toBe(1000);

		const sameRun = foldLivenessState(afterSnapshot, {
			type: 'reset',
			runId: 'r1' as RunId,
		});
		expect(sameRun.map.get('n1')).toBe(1000);
		expect(sameRun.runId).toBe('r1');

		const newRun = foldLivenessState(afterSnapshot, {
			type: 'reset',
			runId: 'r2' as RunId,
		});
		expect(newRun.map.size).toBe(0);
		expect(newRun.runId).toBe('r2');
	});

	it('adopts started runId without wiping stamps while runId is null', () => {
		const afterOutput = foldLivenessState(empty, {
			type: 'output',
			nodeId: 'n1',
			atMs: 50,
		});
		expect(afterOutput.map.get('n1')).toBe(50);

		const afterStarted = foldLivenessState(afterOutput, {
			type: 'reset',
			runId: 'r1' as RunId,
		});
		expect(afterStarted.runId).toBe('r1');
		expect(afterStarted.map.get('n1')).toBe(50);
	});
});
