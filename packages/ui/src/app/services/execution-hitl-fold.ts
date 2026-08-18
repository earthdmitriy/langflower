import type {
	PortTelemetry,
	RunId,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import { isPortTelemetry, isPortValueTelemetry } from '@langflower/runtime';
import type {
	ExecutionFeedSnapshotPayload,
	PaletteConfigPayload,
	PaletteNodeDefinition,
	WorkflowCurrentSnapshotPayload,
} from '@langflower/shared/langflower';
import { combineLatest, merge, type Observable, type Subject } from 'rxjs';
import {
	filter,
	map,
	scan,
	shareReplay,
	startWith,
	switchMap,
} from 'rxjs/operators';
import { paletteByType as paletteNodesByType } from './bridge-diagram.service';
import {
	definitionForNode,
	nodeTypeByIdFromWorkflow,
	resolveOutputFeedRole,
} from './execution-catalog';
import {
	isLlmRecoverySuspended,
	RECOVERY_PORT_ID,
	STEER_CONTROL_PORT_ID,
} from '@langflower/node-sdk/llm';
import type { FeedRole } from '@langflower/node-sdk';
import {
	hitlReplyReceived,
	nonHitlInputReceived,
	steerControlHitlTransition,
} from './hitl-projection';
import type { OutputPortTelemetry } from './execution-chrome-fold';

type InputPortTelemetry = PortTelemetry & {
	readonly 0: 'in';
	readonly 2: string;
	readonly 3: { readonly value: unknown };
};

type HitlFoldEvent =
	| {
			readonly type: 'input';
			readonly nodeId: string;
			readonly portId: string;
			readonly value: unknown;
			readonly palette: ReadonlyMap<string, PaletteNodeDefinition>;
			readonly nodeTypes: ReadonlyMap<string, string>;
	  }
	| {
			readonly type: 'output';
			readonly nodeId: string;
			readonly portId: string;
			readonly value: unknown;
			readonly feedRole: FeedRole | undefined;
	  }
	| { readonly type: 'open'; readonly nodeId: string }
	| { readonly type: 'resolve'; readonly nodeId: string }
	| {
			readonly type: 'hydrate';
			readonly events: ExecutionFeedSnapshotPayload['events'];
			readonly palette: ReadonlyMap<string, PaletteNodeDefinition>;
			readonly nodeTypes: ReadonlyMap<string, string>;
	  }
	| { readonly type: 'hardReset'; readonly runId?: RunId };

type HitlFoldState = {
	readonly ids: ReadonlySet<string>;
	readonly runId: RunId | null;
	/** Once live input/resolve has touched the set, ignore non-clear hydrates. */
	readonly live: boolean;
};

const applySteerTransition = (
	ids: ReadonlySet<string>,
	nodeId: string,
	transition: 'open' | 'close',
): ReadonlySet<string> => {
	if (transition === 'open') {
		if (ids.has(nodeId)) {
			return ids;
		}
		const next = new Set(ids);
		next.add(nodeId);
		return next;
	}
	if (!ids.has(nodeId)) {
		return ids;
	}
	const next = new Set(ids);
	next.delete(nodeId);
	return next;
};

/**
 * Rebuild currently-awaiting HITL nodes from the feed log: a non-HITL wired
 * input opens the composer; a later HITL-port input closes it again (so a
 * multi-turn loop can re-open on the next wired value). ADR-032: `steerControl`
 * pause opens / steer|resume closes (payload-aware). Recovery `suspended`
 * notices on the `recovery` port also open Steer (same await as Pause).
 */
const computeHitlFromEvents = (
	events: ExecutionFeedSnapshotPayload['events'],
	paletteByType: ReadonlyMap<string, PaletteNodeDefinition>,
	nodeTypeById: ReadonlyMap<string, string>,
): Set<string> => {
	const triggered = new Set<string>();
	for (const event of events) {
		if (isPortTelemetry(event) && event[0] === 'out') {
			const [, nodeId, portId, response] = event;
			if (typeof portId !== 'string' || !('value' in response)) {
				continue;
			}
			const role = resolveOutputFeedRole(
				paletteByType,
				nodeTypeById,
				nodeId,
				portId,
			);
			if (
				(role === 'recovery' || portId === RECOVERY_PORT_ID) &&
				isLlmRecoverySuspended(response.value)
			) {
				triggered.add(String(nodeId));
			}
			continue;
		}
		if (
			!isPortValueTelemetry(event) ||
			event[0] !== 'in' ||
			typeof event[2] !== 'string'
		) {
			continue;
		}
		const [, nodeId, portId] = event;
		const value = event[3].value;
		const def = definitionForNode(paletteByType, nodeTypeById, nodeId);
		if (def === undefined) {
			continue;
		}
		const steer = steerControlHitlTransition(portId, value);
		if (steer === 'open') {
			triggered.add(String(nodeId));
			continue;
		}
		if (steer === 'close') {
			triggered.delete(String(nodeId));
			continue;
		}
		if (portId === STEER_CONTROL_PORT_ID) {
			continue;
		}
		if (hitlReplyReceived(def, portId)) {
			triggered.delete(String(nodeId));
		} else if (nonHitlInputReceived(def, String(nodeId), portId)) {
			triggered.add(String(nodeId));
		}
	}
	return triggered;
};

const foldAwaitingHitl = (
	state: HitlFoldState,
	event: HitlFoldEvent,
): HitlFoldState => {
	if (event.type === 'hardReset') {
		if (event.runId !== undefined && event.runId === state.runId) {
			return state;
		}
		return {
			ids: new Set(),
			runId: event.runId ?? null,
			live: false,
		};
	}

	if (event.type === 'hydrate') {
		// After live deltas, ignore stale snapshots (null / completed /
		// partial log) so parallel siblings opened by input-received
		// are not wiped. Hard reset (interrupt / done / new runId) clears
		// instead.
		if (state.live) {
			return state;
		}
		return {
			ids: computeHitlFromEvents(
				event.events,
				event.palette,
				event.nodeTypes,
			),
			runId: state.runId,
			live: false,
		};
	}

	if (event.type === 'open') {
		return {
			ids: applySteerTransition(state.ids, event.nodeId, 'open'),
			runId: state.runId,
			live: true,
		};
	}

	if (event.type === 'resolve') {
		return {
			ids: applySteerTransition(state.ids, event.nodeId, 'close'),
			runId: state.runId,
			live: true,
		};
	}

	if (event.type === 'output') {
		if (
			(event.feedRole === 'recovery' ||
				event.portId === RECOVERY_PORT_ID) &&
			isLlmRecoverySuspended(event.value)
		) {
			return {
				ids: applySteerTransition(state.ids, event.nodeId, 'open'),
				runId: state.runId,
				live: true,
			};
		}
		return state;
	}

	const def = definitionForNode(event.palette, event.nodeTypes, event.nodeId);
	if (def === undefined) {
		return state;
	}
	const steer = steerControlHitlTransition(event.portId, event.value);
	if (steer === 'open' || steer === 'close') {
		return {
			ids: applySteerTransition(state.ids, event.nodeId, steer),
			runId: state.runId,
			live: true,
		};
	}
	if (event.portId === STEER_CONTROL_PORT_ID) {
		return state;
	}
	if (hitlReplyReceived(def, event.portId)) {
		return {
			ids: applySteerTransition(state.ids, event.nodeId, 'close'),
			runId: state.runId,
			live: true,
		};
	}
	if (nonHitlInputReceived(def, event.nodeId, event.portId)) {
		return {
			ids: applySteerTransition(state.ids, event.nodeId, 'open'),
			runId: state.runId,
			live: true,
		};
	}
	return state;
};

export const createHitlTriggeredNodes$ = (deps: {
	readonly workflowSnapshot$: Observable<WorkflowCurrentSnapshotPayload>;
	readonly paletteSnapshot$: Observable<PaletteConfigPayload>;
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly inputReceived$: Observable<InputPortTelemetry>;
	readonly outputEmitted$: Observable<OutputPortTelemetry>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
	readonly runnerDone$: Observable<unknown>;
	readonly runnerInterrupted$: Observable<unknown>;
	readonly hitlOpenLocal$: Subject<string>;
	readonly hitlResolveLocal$: Subject<string>;
}): Observable<ReadonlySet<string>> => {
	const catalog$ = combineLatest([
		deps.workflowSnapshot$,
		deps.paletteSnapshot$,
	]).pipe(
		map(([workflow, palette]) => ({
			palette: paletteNodesByType(palette.nodes),
			nodeTypes: nodeTypeByIdFromWorkflow(workflow),
		})),
		shareReplay(1),
	);

	const input$ = catalog$.pipe(
		switchMap(({ palette, nodeTypes }) =>
			deps.inputReceived$.pipe(
				map((event): HitlFoldEvent => ({
					type: 'input',
					nodeId: String(event[1]),
					portId: event[2],
					value: event[3].value,
					palette,
					nodeTypes,
				})),
			),
		),
	);

	const output$ = catalog$.pipe(
		switchMap(({ palette, nodeTypes }) =>
			deps.outputEmitted$.pipe(
				map((event): HitlFoldEvent => ({
					type: 'output',
					nodeId: String(event[1]),
					portId: event[2],
					value: 'value' in event[3] ? event[3].value : undefined,
					feedRole: resolveOutputFeedRole(
						palette,
						nodeTypes,
						event[1],
						event[2],
					),
				})),
			),
		),
	);

	const open$ = deps.hitlOpenLocal$.pipe(
		map((nodeId): HitlFoldEvent => ({
			type: 'open',
			nodeId,
		})),
	);

	const resolve$ = deps.hitlResolveLocal$.pipe(
		map((nodeId): HitlFoldEvent => ({
			type: 'resolve',
			nodeId,
		})),
	);

	// Hydrate when feed + palette + workflow are all available. Never
	// keyed on isRunning / snapshot status — those wiped parallel siblings.
	const hydrate$ = combineLatest([
		deps.executionFeedSnapshot$,
		deps.workflowSnapshot$,
		deps.paletteSnapshot$,
	]).pipe(
		map(([snap, workflow, palette]): HitlFoldEvent => ({
			type: 'hydrate',
			events: snap === null ? [] : snap.events,
			palette: paletteNodesByType(palette.nodes),
			nodeTypes: nodeTypeByIdFromWorkflow(workflow),
		})),
	);

	const newRunId$ = merge(
		deps.runnerStarted$,
		deps.runnerStartNodeStarted$,
	).pipe(
		map((runId): HitlFoldEvent => ({
			type: 'hardReset',
			runId,
		})),
	);

	const settle$ = merge(deps.runnerInterrupted$, deps.runnerDone$).pipe(
		map((): HitlFoldEvent => ({ type: 'hardReset' })),
	);

	return merge(
		input$,
		output$,
		open$,
		resolve$,
		hydrate$,
		newRunId$,
		settle$,
	).pipe(
		scan(foldAwaitingHitl, {
			ids: new Set<string>(),
			runId: null,
			live: false,
		}),
		map((s) => s.ids),
		startWith(new Set<string>()),
		shareReplay(1),
	);
};
