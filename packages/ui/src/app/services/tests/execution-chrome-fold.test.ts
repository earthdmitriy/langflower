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
		keysFromOutput: (event) => event[5],
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
					{ value: 1 },
					0,
					['e1' as EdgeId],
					null,
				],
			},
			edgeKeying,
		);
		expect(afterOutput.map.get('e1' as EdgeId)).toEqual({ value: 1 });
		expect(afterOutput.runId).toBe('r1');

		const sameRun = foldChromeState(
			afterOutput,
			{ type: 'reset', runId: 'r1' as RunId },
			edgeKeying,
		);
		expect(sameRun.map.get('e1' as EdgeId)).toEqual({ value: 1 });

		const newRun = foldChromeState(
			afterOutput,
			{ type: 'reset', runId: 'r2' as RunId },
			edgeKeying,
		);
		expect(newRun.map.size).toBe(0);
		expect(newRun.runId).toBe('r2');
	});

	it('adopts started runId without wiping a live pending prefix', () => {
		const afterOutput = foldChromeState(
			{ map: new Map(), runId: null },
			{
				type: 'output',
				event: [
					'out',
					'n1' as NodeId,
					'out',
					{ pending: true },
					0,
					['e1' as EdgeId],
					null,
				],
			},
			edgeKeying,
		);
		expect(afterOutput.map.get('e1' as EdgeId)).toEqual({ pending: true });

		const afterStarted = foldChromeState(
			afterOutput,
			{ type: 'reset', runId: 'r1' as RunId },
			edgeKeying,
		);
		expect(afterStarted.runId).toBe('r1');
		expect(afterStarted.map.get('e1' as EdgeId)).toEqual({
			pending: true,
		});
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
							{ pending: true },
							0,
							['e1' as EdgeId],
							null,
						],
					],
				},
			},
			edgeKeying,
		);
		expect(state.map.get('e1' as EdgeId)).toEqual({ pending: true });
	});

	it('keeps trigger-edge value and paints both gate outputs pending', () => {
		let state = foldChromeState(
			{ map: new Map(), runId: 'r1' as RunId },
			{
				type: 'output',
				event: [
					'out',
					'string-1' as NodeId,
					'value',
					{ pending: true },
					0,
					['e-trigger' as EdgeId],
					null,
				],
			},
			edgeKeying,
		);
		state = foldChromeState(
			state,
			{
				type: 'output',
				event: [
					'out',
					'string-1' as NodeId,
					'value',
					{ value: '1' },
					0,
					['e-trigger' as EdgeId],
					null,
				],
			},
			edgeKeying,
		);
		state = foldChromeState(
			state,
			{
				type: 'output',
				event: [
					'out',
					'gate-1' as NodeId,
					'ok',
					{ pending: true },
					0,
					['e-ok' as EdgeId],
					null,
				],
			},
			edgeKeying,
		);
		state = foldChromeState(
			state,
			{
				type: 'output',
				event: [
					'out',
					'gate-1' as NodeId,
					'fail',
					{ pending: true },
					0,
					['e-fail' as EdgeId],
					null,
				],
			},
			edgeKeying,
		);
		expect(state.map.get('e-trigger' as EdgeId)).toEqual({ value: '1' });
		expect(state.map.get('e-ok' as EdgeId)).toEqual({ pending: true });
		expect(state.map.get('e-fail' as EdgeId)).toEqual({ pending: true });
	});
});
