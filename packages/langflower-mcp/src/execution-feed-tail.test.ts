import { describe, expect, it } from 'vitest';
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

const output = (runId: string): RuntimeRunnerEvent => ({
	kind: 'output-emitted',
	runId,
	nodeId: 'n1',
	portId: 'out',
	portIdx: 0,
	edgeIds: [],
	state: 'value',
	value: 'x',
});

const done = (runId: string): RuntimeRunnerEvent => ({
	kind: 'done',
	runId,
});

describe('execution-feed-tail', () => {
	it('accepts eventLog kinds', () => {
		expect(isEventLogAppendKind(output('r1'))).toBe(true);
		expect(isEventLogAppendKind(done('r1'))).toBe(true);
		expect(
			isEventLogAppendKind({
				kind: 'input-received',
				runId: 'r1',
				nodeId: 'n1',
				portId: 'in',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: true,
			}),
		).toBe(true);
	});

	it('is snapshot-canonical with live eventLog appends', () => {
		let state = createExecutionFeedTailState();
		state = applyFeedSnapshot(state, {
			runId: 'r1',
			workflowId: 'wf',
			status: 'running',
			events: [output('r1')],
		});
		state = appendEventLogFrame(state, output('r1'));
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
			events: [output('old'), done('old')],
		});
		state = applyRunStarted(state, 'new');
		state = appendEventLogFrame(state, output('new'));
		const tail = buildExecutionFeedTail(state, 20);
		expect(tail.runId).toBe('new');
		expect(tail.status).toBe('running');
		expect(tail.total).toBe(1);
	});

	it('sets stopped on interrupt (not idle from missing done)', () => {
		let state = applyRunStarted(createExecutionFeedTailState(), 'r1');
		state = appendEventLogFrame(state, output('r1'));
		state = applyRunInterrupted(state);
		expect(buildExecutionFeedTail(state, 5).status).toBe('stopped');
	});

	it('derives settle status from idle gate + events after done', () => {
		let state = applyRunStarted(createExecutionFeedTailState(), 'r1');
		state = appendEventLogFrame(state, output('r1'));
		state = appendEventLogFrame(state, done('r1'));
		expect(buildExecutionFeedTail(state, 5).status).toBe('completed');
	});

	it('prefers runner.snapshot gate over stale snapshot status', () => {
		let state = applyFeedSnapshot(createExecutionFeedTailState(), {
			runId: 'r1',
			workflowId: 'wf',
			status: 'running',
			events: [output('r1')],
		});
		state = applyRunnerSnapshot(state, {
			status: 'stopped',
			runId: 'r1',
			activeWorkflowId: 'wf',
		});
		expect(buildExecutionFeedTail(state, 5).status).toBe('stopped');
	});
});
