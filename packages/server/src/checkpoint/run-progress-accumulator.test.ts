import { describe, expect, it } from 'vitest';
import type { NodeId, RunId } from '@langflower/runtime';
import { RunProgressAccumulator } from './run-progress-accumulator.js';

describe('RunProgressAccumulator', () => {
	it('does not signal a boundary when Stop has nothing to keep', () => {
		const progress = new RunProgressAccumulator();
		progress.beginRun('run-1' as RunId);

		const boundary = progress.observe([
			'out',
			'stage-a' as NodeId,
			'value',
			{ value: 'ok' },
		]);

		expect(boundary).toBe(false);
		expect(progress.snapshot()?.completedNodeIds).toEqual(['stage-a']);
	});

	it('signals a labeled boundary and keeps the JSON snapshot', () => {
		const progress = new RunProgressAccumulator();
		progress.beginRun('run-boundary' as RunId);

		const boundary = progress.observe(
			['out', 'checkpoint-a' as NodeId, 'value', { value: 'ok' }],
			{ label: 'After stage A' },
		);

		expect(boundary).toBe(true);
		expect(progress.snapshot()).toEqual({
			runId: 'run-boundary',
			completedNodeIds: ['checkpoint-a'],
			outputSnapshots: {
				'checkpoint-a': {
					value: { state: 'value', value: 'ok' },
				},
			},
			label: 'After stage A',
		});
	});

	it('records unsupported output and still signals the later boundary', () => {
		const progress = new RunProgressAccumulator();
		progress.beginRun('run-bad' as RunId);

		expect(
			progress.observe([
				'out',
				'stage-a' as NodeId,
				'value',
				{ value: () => 'nope' },
			]),
		).toBe(false);

		expect(
			progress.observe(
				['out', 'checkpoint-a' as NodeId, 'value', { value: 'ok' }],
				{ label: 'After' },
			),
		).toBe(true);

		expect(progress.snapshot()).toMatchObject({
			unsupported: 'stage-a.value',
			label: 'After',
			completedNodeIds: ['checkpoint-a'],
		});
	});

	it('does not signal a replay of a node that is already completed', () => {
		const progress = new RunProgressAccumulator();
		progress.hydrate({
			runId: 'run-1',
			completedNodeIds: ['checkpoint-a'],
			outputSnapshots: {
				'checkpoint-a': {
					value: { state: 'value', value: 'ok' },
				},
			},
		});

		expect(
			progress.observe(
				['out', 'checkpoint-a' as NodeId, 'value', { value: 'ok' }],
				{ label: 'After stage A' },
			),
		).toBe(false);
	});
});
