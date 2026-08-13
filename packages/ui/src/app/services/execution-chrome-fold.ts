import type {
	EdgeId,
	PortTelemetry,
	RunId,
	RuntimePortSignalState,
} from '@langflower/runtime';
import { isPortTelemetry } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
import { merge, type Observable } from 'rxjs';
import { map, scan, shareReplay, startWith } from 'rxjs/operators';

type OutputPortTelemetry = PortTelemetry & { readonly 0: 'out' };

export type ChromeAction =
	| {
			readonly type: 'snapshot';
			readonly snap: ExecutionFeedSnapshotPayload | null;
	  }
	| { readonly type: 'output'; readonly event: OutputPortTelemetry }
	| { readonly type: 'reset'; readonly runId: RunId };

export type ChromeState<K> = {
	readonly map: ReadonlyMap<K, RuntimePortSignalState>;
	readonly runId: RunId | null;
};

export type ChromeKeying<K> = {
	readonly replay: (
		snap: ExecutionFeedSnapshotPayload | null,
	) => ReadonlyMap<K, RuntimePortSignalState>;
	readonly keysFromOutput: (event: OutputPortTelemetry) => readonly K[];
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
		const [, , portId, stateValue] = event;
		if (typeof portId === 'symbol') {
			return state;
		}
		if (
			stateValue !== 'value' &&
			stateValue !== 'pending' &&
			stateValue !== 'error'
		) {
			return state;
		}
		const keys = keying.keysFromOutput(event);
		const next = new Map(state.map);
		for (const key of keys) {
			next.set(key, stateValue);
		}
		return { map: next, runId: state.runId };
	}
	if (action.type === 'reset') {
		if (action.runId === state.runId) {
			return state;
		}
		return { map: new Map(), runId: action.runId };
	}
	return state;
};

export const replayEdgeStates = (
	snapshot: ExecutionFeedSnapshotPayload | null,
): Map<EdgeId, RuntimePortSignalState> => {
	const map = new Map<EdgeId, RuntimePortSignalState>();
	if (snapshot === null) {
		return map;
	}
	for (const event of snapshot.events) {
		if (!isPortTelemetry(event) || event[0] !== 'out') {
			continue;
		}
		const [, , portId, state, , , edgeIds] = event;
		if (
			typeof portId !== 'string' ||
			(state !== 'pending' && state !== 'value' && state !== 'error')
		) {
			continue;
		}
		for (const edgeId of edgeIds) {
			map.set(edgeId, state);
		}
	}
	return map;
};

const EDGE_CHROME_KEYING: ChromeKeying<EdgeId> = {
	replay: replayEdgeStates,
	keysFromOutput: (event) => event[6],
};

const createChromeMap$ = <K>(
	deps: {
		readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
		readonly outputEmitted$: Observable<OutputPortTelemetry>;
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

export const createEdgeStates$ = (deps: {
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly outputEmitted$: Observable<OutputPortTelemetry>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
}): Observable<ReadonlyMap<EdgeId, RuntimePortSignalState>> =>
	createChromeMap$(deps, EDGE_CHROME_KEYING);

export type { OutputPortTelemetry };
