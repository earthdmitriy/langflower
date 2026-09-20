import type { PortTelemetry, RunId } from '@langflower/runtime';
import { isPortTelemetry } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap';
import { merge, type Observable } from 'rxjs';
import { filter, map, scan, shareReplay, startWith } from 'rxjs/operators';

type OutputPortTelemetry = PortTelemetry & { readonly 0: 'out' };

type LivenessAction =
	| { readonly type: 'reset'; readonly runId: RunId }
	| {
			readonly type: 'output';
			readonly nodeId: string;
			readonly atMs: number;
	  }
	| {
			readonly type: 'snapshot';
			readonly snap: ExecutionFeedSnapshotPayload | null;
			readonly atMs: number;
	  };

export type LivenessState = ReadonlyMap<string, number>;

export type LivenessFoldState = {
	readonly map: LivenessState;
	readonly runId: RunId | null;
};

const emptyLivenessState: LivenessState = new Map();

const emptyLivenessFoldState: LivenessFoldState = {
	map: emptyLivenessState,
	runId: null,
};

const nodeIdsFromFeedSnapshot = (
	snap: ExecutionFeedSnapshotPayload | null,
): readonly string[] => {
	if (snap === null) {
		return [];
	}
	const ids = new Set<string>();
	for (const event of snap.events) {
		if (isPortTelemetry(event) && event[0] === 'out') {
			ids.add(String(event[1]));
		}
	}
	return [...ids];
};

const stampSnapshotNodes = (
	state: LivenessState,
	nodeIds: readonly string[],
	atMs: number,
): LivenessState => {
	if (nodeIds.length === 0) {
		return state;
	}
	const next = new Map(state);
	for (const nodeId of nodeIds) {
		if (!next.has(nodeId)) {
			next.set(nodeId, atMs);
		}
	}
	return next;
};

export const foldLivenessState = (
	state: LivenessFoldState,
	action: LivenessAction,
): LivenessFoldState => {
	if (action.type === 'snapshot') {
		if (action.snap === null) {
			return emptyLivenessFoldState;
		}
		return {
			map: stampSnapshotNodes(
				emptyLivenessState,
				nodeIdsFromFeedSnapshot(action.snap),
				action.atMs,
			),
			runId: action.snap.runId ?? null,
		};
	}
	if (action.type === 'output') {
		const next = new Map(state.map);
		next.set(action.nodeId, action.atMs);
		return { map: next, runId: state.runId };
	}
	if (action.runId === state.runId) {
		return state;
	}
	if (state.runId === null) {
		return { map: state.map, runId: action.runId };
	}
	return { map: emptyLivenessState, runId: action.runId };
};

export const createLastActivityByNode$ = (deps: {
	readonly outputEmitted$: Observable<OutputPortTelemetry>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly now?: () => number;
}): Observable<LivenessState> => {
	const now = deps.now ?? (() => Date.now());

	const reset$ = merge(
		deps.runnerStarted$,
		deps.runnerStartNodeStarted$,
	).pipe(map((runId): LivenessAction => ({ type: 'reset', runId })));

	const snapshot$ = deps.executionFeedSnapshot$.pipe(
		map((snap): LivenessAction => ({
			type: 'snapshot',
			snap,
			atMs: now(),
		})),
	);

	const output$ = deps.outputEmitted$.pipe(
		filter((event) => typeof event[2] === 'string'),
		map((event): LivenessAction => ({
			type: 'output',
			nodeId: String(event[1]),
			atMs: now(),
		})),
	);

	return merge(reset$, snapshot$, output$).pipe(
		scan(foldLivenessState, emptyLivenessFoldState),
		map((state) => state.map),
		startWith(emptyLivenessState),
		shareReplay(1),
	);
};
