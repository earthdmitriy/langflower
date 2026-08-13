import type { EdgeId, NodeId, RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import {
	foldChromeState,
	replayEdgeStates,
	type ChromeKeying,
} from '../execution-chrome-fold.js';

describe('foldChromeState', () => {
	const edgeKeying: ChromeKeying<EdgeId> = {
		replay: replayEdgeStates,
		keysFromOutput: (event) => event[6],
	};

	it('applies output and reset without wiping same-runId', () => {
		const afterSnapshot = foldChromeState(
			{ map: new Map(), runId: null },
			{
				type: 'snapshot',
				snap: {
					runId: 'r1' as RunId,
					workflowId: 'w1',
					status: 'running',
					events: [],
				},
			},
			edgeKeying,
		);
		expect(afterSnapshot.runId).toBe('r1');

		const afterOutput = foldChromeState(
			afterSnapshot,
			{
				type: 'output',
				event: [
					'out',
					'n1' as NodeId,
					'out',
					'value',
					1,
					0,
					['e1' as EdgeId],
					null,
				],
			},
			edgeKeying,
		);
		expect(afterOutput.map.get('e1' as EdgeId)).toBe('value');
		expect(afterOutput.runId).toBe('r1');

		const sameRun = foldChromeState(
			afterOutput,
			{ type: 'reset', runId: 'r1' as RunId },
			edgeKeying,
		);
		expect(sameRun.map.get('e1' as EdgeId)).toBe('value');

		const newRun = foldChromeState(
			afterOutput,
			{ type: 'reset', runId: 'r2' as RunId },
			edgeKeying,
		);
		expect(newRun.map.size).toBe(0);
		expect(newRun.runId).toBe('r2');
	});

	it('replays edge ids from snapshot', () => {
		const state = foldChromeState(
			{ map: new Map(), runId: null },
			{
				type: 'snapshot',
				snap: {
					runId: 'r1' as RunId,
					workflowId: 'w1',
					status: 'running',
					events: [
						[
							'out',
							'n1' as NodeId,
							'out',
							'pending',
							undefined,
							0,
							['e1' as EdgeId],
							null,
						],
					],
				},
			},
			edgeKeying,
		);
		expect(state.map.get('e1' as EdgeId)).toBe('pending');
	});
});
