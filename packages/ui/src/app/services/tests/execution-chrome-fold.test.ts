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
		keysFromOutput: (event) => event.edgeIds ?? [],
	};

	it('applies output and reset without wiping same-runId', () => {
		const afterOutput = foldChromeState(
			{ map: new Map(), runId: null },
			{
				type: 'output',
				event: {
					kind: 'output-emitted',
					runId: 'r1' as RunId,
					nodeId: 'n1' as NodeId,
					portId: 'out',
					portIdx: 0,
					state: 'value',
					value: 1,
					edgeIds: ['e1' as EdgeId],
				},
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
						{
							kind: 'output-emitted',
							runId: 'r1' as RunId,
							nodeId: 'n1' as NodeId,
							portId: 'out',
							portIdx: 0,
							state: 'pending',
							value: undefined,
							edgeIds: ['e1' as EdgeId],
						},
					],
				},
			},
			edgeKeying,
		);
		expect(state.map.get('e1' as EdgeId)).toBe('pending');
	});
});
