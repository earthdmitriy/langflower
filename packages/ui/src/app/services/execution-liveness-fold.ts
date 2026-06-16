import type { RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
import { merge, type Observable } from 'rxjs';
import { filter, map, scan, shareReplay, startWith } from 'rxjs/operators';

type OutputEmittedEvent = Extract<
	RuntimeRunnerEvent,
	{ kind: 'output-emitted' }
>;

type LivenessAction =
	| { readonly type: 'reset' }
	| {
			readonly type: 'output';
			readonly nodeId: string;
			readonly atMs: number;
	  }
	| {
			readonly type: 'stampActive';
			readonly nodeIds: readonly string[];
			readonly atMs: number;
	  };

export type LivenessState = ReadonlyMap<string, number>;

const emptyLivenessState: LivenessState = new Map();

const foldLivenessState = (
	state: LivenessState,
	action: LivenessAction,
): LivenessState => {
	if (action.type === 'reset') {
		return emptyLivenessState;
	}
	if (action.type === 'output') {
		const next = new Map(state);
		next.set(action.nodeId, action.atMs);
		return next;
	}
	if (action.nodeIds.length === 0) {
		return state;
	}
	const next = new Map(state);
	for (const nodeId of action.nodeIds) {
		if (!next.has(nodeId)) {
			next.set(nodeId, action.atMs);
		}
	}
	return next;
};

/** Nodes that emitted in the snapshot (reconnect approximation for active work). */
const nodeIdsFromFeedSnapshot = (
	snap: ExecutionFeedSnapshotPayload | null,
): readonly string[] => {
	if (snap === null) {
		return [];
	}
	const ids = new Set<string>();
	for (const event of snap.events) {
		if (event.kind === 'output-emitted') {
			ids.add(event.nodeId);
		}
	}
	return [...ids];
};

/**
 * Client wall-clock last `output-emitted` per nodeId. Snapshot replay does not
 * invent historical times — after hydrate, stamp `Date.now()` once for nodes
 * present in the snapshot log (fills gaps until the next live emission).
 */
export const createLastActivityByNode$ = (deps: {
	readonly outputEmitted$: Observable<OutputEmittedEvent>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly now?: () => number;
}): Observable<LivenessState> => {
	const now = deps.now ?? (() => Date.now());

	const reset$ = merge(
		deps.runnerStarted$,
		deps.runnerStartNodeStarted$,
	).pipe(map((): LivenessAction => ({ type: 'reset' })));

	const snapshot$ = deps.executionFeedSnapshot$.pipe(
		map((snap): LivenessAction => {
			if (snap === null) {
				return { type: 'reset' };
			}
			return {
				type: 'stampActive',
				nodeIds: nodeIdsFromFeedSnapshot(snap),
				atMs: now(),
			};
		}),
	);

	const output$ = deps.outputEmitted$.pipe(
		filter((event) => typeof event.portId === 'string'),
		map((event): LivenessAction => ({
			type: 'output',
			nodeId: event.nodeId,
			atMs: now(),
		})),
	);

	return merge(reset$, snapshot$, output$).pipe(
		scan(foldLivenessState, emptyLivenessState),
		startWith(emptyLivenessState),
		shareReplay(1),
	);
};
