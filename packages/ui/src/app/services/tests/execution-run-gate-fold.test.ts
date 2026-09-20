import type { RunId } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
	createIsRunning$,
	foldRunGate,
	type RunGateState,
} from '../execution-run-gate-fold';

const idle: RunGateState = { running: false, currentRunId: null };

const runningSnap = (runId: string): ExecutionFeedSnapshotPayload => ({
	runId: runId as RunId,
	workflowId: 'wf',
	status: 'running',
	events: [],
});

const completedSnap = (runId: string): ExecutionFeedSnapshotPayload => ({
	runId: runId as RunId,
	workflowId: 'wf',
	status: 'completed',
	events: [],
});

describe('foldRunGate', () => {
	it('treats only snapshot status running as live', () => {
		const fromNull = foldRunGate(idle, {
			type: 'snapshot',
			running: false,
			runId: null,
		});
		expect(fromNull.running).toBe(false);

		const fromIdleSnap = foldRunGate(idle, {
			type: 'snapshot',
			running: false,
			runId: 'r1' as RunId,
		});
		expect(fromIdleSnap.running).toBe(false);

		const fromRunningSnap = foldRunGate(idle, {
			type: 'snapshot',
			running: true,
			runId: 'r1' as RunId,
		});
		expect(fromRunningSnap).toEqual({
			running: true,
			currentRunId: 'r1',
		});
	});

	it('starts a new runId and ignores duplicate started while running', () => {
		const started = foldRunGate(idle, {
			type: 'start',
			runId: 'r1' as RunId,
		});
		expect(started).toEqual({ running: true, currentRunId: 'r1' });

		const duplicate = foldRunGate(started, {
			type: 'start',
			runId: 'r1' as RunId,
		});
		expect(duplicate).toBe(started);

		const nextRun = foldRunGate(started, {
			type: 'start',
			runId: 'r2' as RunId,
		});
		expect(nextRun).toEqual({ running: true, currentRunId: 'r2' });
	});

	it('re-arms the same runId when the gate is already stopped', () => {
		const stopped: RunGateState = {
			running: false,
			currentRunId: 'r1' as RunId,
		};
		const restarted = foldRunGate(stopped, {
			type: 'start',
			runId: 'r1' as RunId,
		});
		expect(restarted).toEqual({ running: true, currentRunId: 'r1' });
	});

	it('stops on done or interrupt', () => {
		const started = foldRunGate(idle, {
			type: 'start',
			runId: 'r1' as RunId,
		});
		expect(foldRunGate(started, { type: 'stop' })).toEqual(idle);
	});
});

describe('createIsRunning$', () => {
	it('tracks snapshot, start, done, and interrupt', () => {
		const executionFeedSnapshot$ =
			new Subject<ExecutionFeedSnapshotPayload | null>();
		const runnerStarted$ = new Subject<RunId>();
		const runnerStartNodeStarted$ = new Subject<RunId>();
		const runnerDone$ = new Subject<unknown>();
		const runnerInterrupted$ = new Subject<unknown>();
		const seen: boolean[] = [];
		const sub = createIsRunning$({
			executionFeedSnapshot$,
			runnerStarted$,
			runnerStartNodeStarted$,
			runnerDone$,
			runnerInterrupted$,
		}).subscribe((running) => {
			seen.push(running);
		});

		expect(seen).toEqual([false]);

		executionFeedSnapshot$.next(runningSnap('r1'));
		expect(seen.at(-1)).toBe(true);

		executionFeedSnapshot$.next(completedSnap('r1'));
		expect(seen.at(-1)).toBe(false);

		runnerStarted$.next('r2' as RunId);
		expect(seen.at(-1)).toBe(true);

		runnerDone$.next(undefined);
		expect(seen.at(-1)).toBe(false);

		runnerStartNodeStarted$.next('r3' as RunId);
		expect(seen.at(-1)).toBe(true);

		runnerInterrupted$.next(undefined);
		expect(seen.at(-1)).toBe(false);

		sub.unsubscribe();
	});

	it('does not flicker on a duplicate started runId', () => {
		const executionFeedSnapshot$ =
			new Subject<ExecutionFeedSnapshotPayload | null>();
		const runnerStarted$ = new Subject<RunId>();
		const runnerStartNodeStarted$ = new Subject<RunId>();
		const runnerDone$ = new Subject<unknown>();
		const runnerInterrupted$ = new Subject<unknown>();
		const seen: boolean[] = [];
		const sub = createIsRunning$({
			executionFeedSnapshot$,
			runnerStarted$,
			runnerStartNodeStarted$,
			runnerDone$,
			runnerInterrupted$,
		}).subscribe((running) => {
			seen.push(running);
		});

		runnerStarted$.next('r1' as RunId);
		const afterStart = seen.length;
		runnerStarted$.next('r1' as RunId);
		expect(seen.length).toBe(afterStart);
		expect(seen.at(-1)).toBe(true);

		sub.unsubscribe();
	});
});
