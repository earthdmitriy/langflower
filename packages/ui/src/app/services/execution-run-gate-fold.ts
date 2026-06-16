import type { RunId } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
import { merge, type Observable } from 'rxjs';
import { map, scan, shareReplay, startWith } from 'rxjs/operators';

type RunGateState = {
	readonly running: boolean;
	readonly currentRunId: RunId | null;
};

type RunGateAction =
	| {
			readonly type: 'snapshot';
			readonly running: boolean;
			readonly runId: RunId | null;
	  }
	| { readonly type: 'start'; readonly runId: RunId }
	| { readonly type: 'stop' };

const foldRunGate = (
	state: RunGateState,
	action: RunGateAction,
): RunGateState => {
	if (action.type === 'snapshot') {
		return {
			running: action.running,
			currentRunId: action.runId,
		};
	}
	if (action.type === 'start') {
		if (action.runId === state.currentRunId) {
			return state.running
				? state
				: { running: true, currentRunId: action.runId };
		}
		return { running: true, currentRunId: action.runId };
	}
	return { running: false, currentRunId: null };
};

export const createIsRunning$ = (deps: {
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
	readonly runnerDone$: Observable<unknown>;
	readonly runnerInterrupted$: Observable<unknown>;
}): Observable<boolean> => {
	const snapshotAction$ = deps.executionFeedSnapshot$.pipe(
		map((snap): RunGateAction => ({
			type: 'snapshot',
			running: snap !== null && snap.status === 'running',
			runId:
				snap !== null && snap.status === 'running' ? snap.runId : null,
		})),
	);
	const startAction$ = merge(
		deps.runnerStarted$,
		deps.runnerStartNodeStarted$,
	).pipe(map((runId): RunGateAction => ({ type: 'start', runId })));
	const stopAction$ = merge(deps.runnerDone$, deps.runnerInterrupted$).pipe(
		map((): RunGateAction => ({ type: 'stop' })),
	);

	return merge(snapshotAction$, startAction$, stopAction$).pipe(
		scan(foldRunGate, { running: false, currentRunId: null }),
		map((s) => s.running),
		startWith(false),
		shareReplay(1),
	);
};
