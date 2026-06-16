import type {
	EdgeId,
	RunId,
	RuntimePortSignalState,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
import { merge, type Observable } from 'rxjs';
import { map, scan, shareReplay, startWith } from 'rxjs/operators';

type OutputEmittedEvent = Extract<
	RuntimeRunnerEvent,
	{ kind: 'output-emitted' }
>;

export type ChromeAction =
	| {
			readonly type: 'snapshot';
			readonly snap: ExecutionFeedSnapshotPayload | null;
	  }
	| { readonly type: 'output'; readonly event: OutputEmittedEvent }
	| { readonly type: 'reset'; readonly runId: RunId };

export type ChromeState<K> = {
	readonly map: ReadonlyMap<K, RuntimePortSignalState>;
	readonly runId: RunId | null;
};

export type ChromeKeying<K> = {
	readonly replay: (
		snap: ExecutionFeedSnapshotPayload | null,
	) => ReadonlyMap<K, RuntimePortSignalState>;
	readonly keysFromOutput: (event: OutputEmittedEvent) => readonly K[];
};

export const foldChromeState = <K>(
	state: ChromeState<K>,
	action: ChromeAction,
	keying: ChromeKeying<K>,
): ChromeState<K> => {
	if (action.type === 'snapshot') {
		return {
			map: keying.replay(action.snap),
			runId: action.snap?.runId ?? null,
		};
	}
	if (action.type === 'output') {
		const event = action.event;
		if (typeof event.portId === 'symbol') {
			return state;
		}
		if (
			event.state !== 'value' &&
			event.state !== 'pending' &&
			event.state !== 'error'
		) {
			return state;
		}
		const keys = keying.keysFromOutput(event);
		const next = new Map(state.map);
		for (const key of keys) {
			next.set(key, event.state);
		}
		return { map: next, runId: event.runId };
	}
	if (action.type === 'reset') {
		if (action.runId === state.runId) {
			return state;
		}
		return { map: new Map(), runId: action.runId };
	}
	return state;
};

export const replayNodeOutputStates = (
	snapshot: ExecutionFeedSnapshotPayload | null,
): Map<string, RuntimePortSignalState> => {
	const map = new Map<string, RuntimePortSignalState>();
	if (snapshot === null) {
		return map;
	}
	for (const event of snapshot.events) {
		if (
			event.kind === 'output-emitted' &&
			typeof event.portId === 'string' &&
			(event.state === 'value' ||
				event.state === 'pending' ||
				event.state === 'error')
		) {
			map.set(`${event.nodeId}:${event.portId}`, event.state);
		}
	}
	return map;
};

export const replayEdgeStates = (
	snapshot: ExecutionFeedSnapshotPayload | null,
): Map<EdgeId, RuntimePortSignalState> => {
	const map = new Map<EdgeId, RuntimePortSignalState>();
	if (snapshot === null) {
		return map;
	}
	for (const event of snapshot.events) {
		if (
			event.kind === 'output-emitted' &&
			typeof event.portId === 'string' &&
			(event.state === 'pending' ||
				event.state === 'value' ||
				event.state === 'error')
		) {
			for (const edgeId of event.edgeIds ?? []) {
				map.set(edgeId, event.state);
			}
		}
	}
	return map;
};

const NODE_CHROME_KEYING: ChromeKeying<string> = {
	replay: replayNodeOutputStates,
	keysFromOutput: (event) =>
		typeof event.portId === 'string'
			? [`${event.nodeId}:${event.portId}`]
			: [],
};

const EDGE_CHROME_KEYING: ChromeKeying<EdgeId> = {
	replay: replayEdgeStates,
	keysFromOutput: (event) => event.edgeIds ?? [],
};

const createChromeMap$ = <K>(
	deps: {
		readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
		readonly outputEmitted$: Observable<OutputEmittedEvent>;
		readonly runnerStarted$: Observable<RunId>;
		readonly runnerStartNodeStarted$: Observable<RunId>;
	},
	keying: ChromeKeying<K>,
): Observable<ReadonlyMap<K, RuntimePortSignalState>> => {
	const snapshotAction$ = deps.executionFeedSnapshot$.pipe(
		map((snap): ChromeAction => ({ type: 'snapshot', snap })),
	);
	const outputAction$ = deps.outputEmitted$.pipe(
		map((event): ChromeAction => ({ type: 'output', event })),
	);
	const startReset$ = merge(
		deps.runnerStarted$,
		deps.runnerStartNodeStarted$,
	).pipe(map((runId): ChromeAction => ({ type: 'reset', runId })));
	// Keep settled chrome after `runner.done` / interrupt so live settle
	// matches reconnect snapshot replay (detachable-long-run S2–S3).
	// New runs clear via `reset`; idle/null snapshot clears via `snapshot`.

	return merge(snapshotAction$, outputAction$, startReset$).pipe(
		scan(
			(state, action): ChromeState<K> =>
				foldChromeState(state, action, keying),
			{ map: new Map<K, RuntimePortSignalState>(), runId: null },
		),
		map((s) => s.map),
		startWith(new Map<K, RuntimePortSignalState>()),
		shareReplay(1),
	);
};

export const createNodeOutputStates$ = (deps: {
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly outputEmitted$: Observable<OutputEmittedEvent>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
}): Observable<ReadonlyMap<string, RuntimePortSignalState>> =>
	createChromeMap$(deps, NODE_CHROME_KEYING);

export const createEdgeStates$ = (deps: {
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly outputEmitted$: Observable<OutputEmittedEvent>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
}): Observable<ReadonlyMap<EdgeId, RuntimePortSignalState>> =>
	createChromeMap$(deps, EDGE_CHROME_KEYING);
