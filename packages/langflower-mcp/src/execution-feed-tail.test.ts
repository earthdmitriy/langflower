import { describe, expect, it } from 'vitest';
import type { NodeId } from '@langflower/runtime';
import {
	appendEventLogFrame,
	applyFeedSnapshot,
	applyRunInterrupted,
	applyRunStarted,
	applyRunnerSnapshot,
	buildExecutionFeedTail,
	createExecutionFeedTailState,
	isEventLogAppendKind,
} from './execution-feed-tail.js';
import type { RuntimeRunnerEvent } from './runtime-event-types.js';

const output = (): RuntimeRunnerEvent => [
	'out',
	'n1' as NodeId,
	'out',
	{ value: 'x' },
	0,
	[],
	null,
];

const done = (runId: string): RuntimeRunnerEvent => ['done', runId];

describe('execution-feed-tail', () => {
	it('accepts eventLog kinds', () => {
		expect(isEventLogAppendKind(output())).toBe(true);
		expect(isEventLogAppendKind(done('r1'))).toBe(true);
		expect(
			isEventLogAppendKind([
				'in',
				'n1' as NodeId,
				'in',
				{ value: true },
				0,
				[],
				null,
			]),
		).toBe(true);
	});

	it('is snapshot-canonical with live eventLog appends', () => {
		let state = createExecutionFeedTailState();
		state = applyFeedSnapshot(state, {
			runId: 'r1',
			workflowId: 'wf',
			status: 'running',
			events: [output()],
		});
		state = appendEventLogFrame(state, output());
		const tail = buildExecutionFeedTail(state, 10);
		expect(tail.total).toBe(2);
		expect(tail.events).toHaveLength(2);
		expect(tail.runId).toBe('r1');
	});

	it('clears on start and sets running from runner gate', () => {
		let state = applyFeedSnapshot(createExecutionFeedTailState(), {
			runId: 'old',
			workflowId: 'wf',
			status: 'completed',
			events: [output(), done('old')],
		});
		state = applyRunStarted(state, 'new');
		state = appendEventLogFrame(state, output());
		const tail = buildExecutionFeedTail(state, 20);
		expect(tail.runId).toBe('new');
		expect(tail.status).toBe('running');
		expect(tail.total).toBe(1);
	});

	it('sets stopped on interrupt (not idle from missing done)', () => {
		let state = applyRunStarted(createExecutionFeedTailState(), 'r1');
		state = appendEventLogFrame(state, output());
		state = applyRunInterrupted(state);
		expect(buildExecutionFeedTail(state, 5).status).toBe('stopped');
	});

	it('derives settle status from idle gate + events after done', () => {
		let state = applyRunStarted(createExecutionFeedTailState(), 'r1');
		state = appendEventLogFrame(state, output());
		state = appendEventLogFrame(state, done('r1'));
		expect(buildExecutionFeedTail(state, 5).status).toBe('completed');
	});

	it('prefers runner.snapshot gate over stale snapshot status', () => {
		let state = applyFeedSnapshot(createExecutionFeedTailState(), {
			runId: 'r1',
			workflowId: 'wf',
			status: 'running',
			events: [output()],
		});
		state = applyRunnerSnapshot(state, {
			status: 'stopped',
			runId: 'r1',
			activeWorkflowId: 'wf',
		});
		expect(buildExecutionFeedTail(state, 5).status).toBe('stopped');
	});
});
