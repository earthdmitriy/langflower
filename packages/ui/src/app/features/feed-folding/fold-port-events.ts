import {
	STEER_CONTROL_PORT_ID,
	isSteerControlPayload,
} from '@langflower/node-sdk/llm';
import type {
	PortTelemetry,
	RunId,
	RuntimeFeedRole,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import { isPortTelemetry } from '@langflower/runtime';
import type {
	RunnerAskUserAskPayload,
	RunnerAskUserReplyPayload,
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from '@langflower/shared/types/langflower-config';
import { combineLatest, merge, type Observable } from 'rxjs';
import {
	distinctUntilChanged,
	map,
	scan,
	shareReplay,
	startWith,
	switchMap,
} from 'rxjs/operators';
import {
	catalogSwitchedDocument,
	definitionForNode,
	feedCatalogFromSnaps,
	formatHitlUserText,
	mergePaletteCatalogs,
	workflowNodeIdsKey,
	type FeedCatalog,
} from '../../services/execution-catalog';
import {
	frameClosesPreviousVisit,
	frameFeedRole,
	frameIsStreaming,
} from '../../services/frame-feed-meta';
import { hitlReplyReceived } from '../../services/hitl-projection';
import {
	projectFeedRows,
	projectNodeFeed,
} from './operators/feed-folding-operators';
import {
	appendFeedFrame,
	emptyFeedProjection,
	replayFeedProjection,
	type FeedProjection,
} from './operators/feed-projection';
import type {
	AskUserFeedEvent,
	FeedEventFromSource,
	FeedBridgeSources,
	FeedRow,
	NodeFeedItem,
	PermissionFeedEvent,
	PortEventFromServer,
	PortFrameMeta,
} from './types';

type FeedSourceEntry =
	RuntimeRunnerEvent | PermissionFeedEvent | AskUserFeedEvent;

type FeedComposerState = {
	readonly asksById: ReadonlyMap<string, RunnerPermissionAskPayload>;
	readonly askUserById: ReadonlyMap<string, RunnerAskUserAskPayload>;
	readonly projection: FeedProjection;
	readonly runId: RunId | null;
	readonly workflowId: string | null;
	readonly nodeIdsKey: string;
	readonly pending: readonly FeedSourceEntry[];
};

type FeedComposerAction =
	| {
			readonly type: 'snapshot';
			readonly events: readonly RuntimeRunnerEvent[];
			readonly runId: RunId | null;
			readonly catalog: FeedCatalog;
	  }
	| { readonly type: 'clear' }
	| {
			readonly type: 'port';
			readonly event: PortTelemetry;
			readonly catalog: FeedCatalog;
	  }
	| {
			readonly type: 'permission-ask';
			readonly ask: RunnerPermissionAskPayload;
	  }
	| {
			readonly type: 'permission-accepted';
			readonly accepted: RunnerPermissionReplyPayload;
	  }
	| {
			readonly type: 'ask-user-ask';
			readonly ask: RunnerAskUserAskPayload;
	  }
	| {
			readonly type: 'ask-user-accepted';
			readonly accepted: RunnerAskUserReplyPayload;
	  }
	| {
			readonly type: 'document';
			readonly workflowId: string | null;
			readonly nodeIdsKey: string;
	  }
	| {
			readonly type: 'run-started';
			readonly runId: RunId;
			readonly catalog: FeedCatalog;
	  };

const emptyComposer: FeedComposerState = {
	asksById: new Map(),
	askUserById: new Map(),
	projection: emptyFeedProjection(),
	runId: null,
	workflowId: null,
	nodeIdsKey: '',
	pending: [],
};

const permissionPortId = (askId: string): `permission:${string}` =>
	`permission:${askId}`;

const permissionAskEvent = (
	ask: RunnerPermissionAskPayload,
): PermissionFeedEvent => ({
	source: 'permission',
	kind: 'permission',
	runId: ask.runId as RunId,
	nodeId: ask.nodeId,
	portId: permissionPortId(ask.askId),
	state: 'pending',
	value: ask,
	meta: {
		presentation: 'permission-ask',
		askId: ask.askId,
		authority: 'server',
	},
});

const permissionDecisionEvent = (
	accepted: RunnerPermissionReplyPayload,
	ask: RunnerPermissionAskPayload,
): PermissionFeedEvent | null => {
	if (accepted.runId !== ask.runId) {
		return null;
	}
	return {
		source: 'permission',
		kind: 'permission',
		runId: accepted.runId as RunId,
		nodeId: ask.nodeId,
		portId: permissionPortId(accepted.askId),
		state: 'value',
		value: accepted,
		meta: {
			presentation:
				accepted.decision === 'allow'
					? 'permission-grant'
					: 'permission-deny',
			askId: accepted.askId,
			authority: 'server',
		},
	};
};

const askUserPortId = (askId: string): `askUser:${string}` =>
	`askUser:${askId}`;

const askUserAskFeedValue = (ask: RunnerAskUserAskPayload): string => {
	const headline = ask.question.trim();
	if (headline.length > 0) {
		return ask.question;
	}

	return (ask.questions ?? []).map((question) => question.prompt).join('\n');
};

const askUserAskEvent = (ask: RunnerAskUserAskPayload): AskUserFeedEvent => ({
	source: 'ask-user',
	kind: 'ask-user',
	runId: ask.runId as RunId,
	nodeId: ask.nodeId,
	portId: askUserPortId(ask.askId),
	state: 'pending',
	value: askUserAskFeedValue(ask),
	meta: {
		presentation: 'ask-user-ask',
		askId: ask.askId,
		authority: 'server',
	},
});

const askUserReplyEvent = (
	accepted: RunnerAskUserReplyPayload,
	ask: RunnerAskUserAskPayload,
): AskUserFeedEvent | null => {
	if (accepted.runId !== ask.runId) {
		return null;
	}
	return {
		source: 'ask-user',
		kind: 'ask-user',
		runId: accepted.runId as RunId,
		nodeId: ask.nodeId,
		portId: askUserPortId(accepted.askId),
		state: 'value',
		value: accepted.text,
		meta: {
			presentation: 'ask-user-reply',
			askId: accepted.askId,
			authority: 'server',
		},
	};
};

type RolePresentation =
	| 'none'
	| 'reasoning'
	| 'progress'
	| 'draft'
	| 'tool'
	| 'shell'
	| 'result'
	| 'recovery';

const presentationFromRole = (
	role: RuntimeFeedRole | undefined,
): RolePresentation => {
	if (role === undefined || role === 'none') {
		return 'none';
	}
	return role;
};

const withClosesPreviousVisit = <T extends PortFrameMeta>(
	meta: T,
	event: PortTelemetry,
): T =>
	frameClosesPreviousVisit(event)
		? ({ ...meta, closesPreviousVisit: true as const } as T)
		: meta;

const withDerivedVisitClose = <T extends PortFrameMeta>(
	meta: T,
	streaming: boolean,
): T =>
	streaming ? meta : ({ ...meta, visitBoundary: 'close' as const } as T);

const frameMeta = (event: PortTelemetry): PortFrameMeta | 'none' => {
	const [, , , response] = event;
	if ('error' in response) {
		return withClosesPreviousVisit(
			withDerivedVisitClose({ presentation: 'error' }, false),
			event,
		);
	}
	const presentation = presentationFromRole(frameFeedRole(event));
	if (presentation === 'none') {
		return 'none';
	}
	return withClosesPreviousVisit(
		withDerivedVisitClose({ presentation }, frameIsStreaming(event)),
		event,
	);
};

const normalizePortFrame = (
	event: PortTelemetry,
	runId: RunId,
	catalog: FeedCatalog,
): PortEventFromServer | null => {
	const [portDir, nodeId, portId, response] = event;
	if (typeof portId !== 'string') {
		return null;
	}
	if ('pending' in response || 'inactive' in response) {
		return null;
	}
	const kind =
		portDir === 'out'
			? ('output-emitted' as const)
			: ('input-received' as const);
	const state = 'error' in response ? ('error' as const) : ('value' as const);
	const value = 'error' in response ? response.error : response.value;
	const base = {
		source: 'port' as const,
		kind,
		runId,
		nodeId,
		portId,
		state,
		value,
	};

	if (portId === STEER_CONTROL_PORT_ID && isSteerControlPayload(value)) {
		if (value.kind === 'pause') {
			return {
				...base,
				meta: withClosesPreviousVisit(
					withDerivedVisitClose(
						{ presentation: 'steering-pause', payload: value },
						false,
					),
					event,
				),
			};
		}
		if (value.kind === 'steer') {
			return {
				...base,
				value: value.text.trim(),
				meta: withClosesPreviousVisit(
					withDerivedVisitClose(
						{
							presentation: 'hitl-user',
							origin: 'steer',
							payload: value,
						},
						false,
					),
					event,
				),
			};
		}
		return {
			...base,
			meta: withClosesPreviousVisit(
				withDerivedVisitClose(
					{ presentation: 'steering-resume', payload: value },
					false,
				),
				event,
			),
		};
	}

	const definition = definitionForNode(
		catalog.paletteByType,
		catalog.nodeTypeById,
		nodeId,
	);
	if (
		portDir === 'in' &&
		definition !== undefined &&
		hitlReplyReceived(definition, portId)
	) {
		const text = formatHitlUserText(definition, portId, value);
		return {
			...base,
			value: text,
			meta: withClosesPreviousVisit(
				withDerivedVisitClose(
					{ presentation: 'hitl-user', origin: 'hitl-reply' },
					frameIsStreaming(event),
				),
				event,
			),
		};
	}

	const meta = frameMeta(event);
	if (meta === 'none') {
		return null;
	}
	return { ...base, meta };
};

const normalizeEntry = (
	entry: FeedSourceEntry,
	runId: RunId | null,
	catalog: FeedCatalog,
): FeedEventFromSource | null => {
	if ('source' in entry) {
		return entry;
	}
	if (!isPortTelemetry(entry) || runId === null) {
		return null;
	}
	return normalizePortFrame(entry, runId, catalog);
};

const replayNormalized = (
	entries: readonly FeedSourceEntry[],
	runId: RunId | null,
	catalog: FeedCatalog,
): FeedProjection =>
	replayFeedProjection(
		entries.flatMap((entry) => {
			const normalized = normalizeEntry(entry, runId, catalog);
			return normalized === null ? [] : [normalized];
		}),
	);

const appendEntry = (
	state: FeedComposerState,
	entry: FeedSourceEntry,
	maps: {
		readonly asksById?: ReadonlyMap<string, RunnerPermissionAskPayload>;
		readonly askUserById?: ReadonlyMap<string, RunnerAskUserAskPayload>;
	} = {},
	catalog?: FeedCatalog,
): FeedComposerState => {
	const asksById = maps.asksById ?? state.asksById;
	const askUserById = maps.askUserById ?? state.askUserById;
	if (state.runId === null) {
		return {
			...state,
			asksById,
			askUserById,
			pending: [...state.pending, entry],
		};
	}
	const normalized =
		catalog === undefined && !('source' in entry)
			? null
			: normalizeEntry(
					entry,
					state.runId,
					catalog ?? {
						labels: new Map(),
						paletteByType: new Map(),
						nodeTypeById: new Map(),
					},
				);
	if (normalized === null) {
		return { ...state, asksById, askUserById };
	}
	return {
		...state,
		asksById,
		askUserById,
		projection: appendFeedFrame(state.projection, normalized),
	};
};

const documentKey = (
	state: FeedComposerState,
): {
	readonly workflowId: string | null;
	readonly nodeIdsKey: string;
} | null =>
	state.workflowId === null && state.nodeIdsKey === ''
		? null
		: { workflowId: state.workflowId, nodeIdsKey: state.nodeIdsKey };

const foldComposer = (
	state: FeedComposerState,
	action: FeedComposerAction,
): FeedComposerState => {
	if (action.type === 'document') {
		if (
			catalogSwitchedDocument(documentKey(state), {
				workflowId: action.workflowId,
				nodeIdsKey: action.nodeIdsKey,
			})
		) {
			return {
				...emptyComposer,
				workflowId: action.workflowId,
				nodeIdsKey: action.nodeIdsKey,
			};
		}
		return {
			...state,
			workflowId: action.workflowId,
			nodeIdsKey: action.nodeIdsKey,
		};
	}
	if (action.type === 'clear') {
		return {
			...emptyComposer,
			workflowId: state.workflowId,
			nodeIdsKey: state.nodeIdsKey,
		};
	}
	if (action.type === 'run-started') {
		if (action.runId === state.runId) {
			return state;
		}
		if (state.runId === null) {
			return {
				...state,
				runId: action.runId,
				pending: [],
				projection: replayNormalized(
					state.pending,
					action.runId,
					action.catalog,
				),
			};
		}
		return {
			...emptyComposer,
			workflowId: state.workflowId,
			nodeIdsKey: state.nodeIdsKey,
			runId: action.runId,
		};
	}
	if (action.type === 'snapshot') {
		return {
			asksById: new Map(),
			askUserById: new Map(),
			workflowId: state.workflowId,
			nodeIdsKey: state.nodeIdsKey,
			pending: [],
			runId: action.runId,
			projection:
				action.runId === null
					? emptyFeedProjection()
					: replayNormalized(
							action.events,
							action.runId,
							action.catalog,
						),
		};
	}
	if (action.type === 'port') {
		return appendEntry(state, action.event, {}, action.catalog);
	}
	if (action.type === 'permission-ask') {
		const asksById = new Map(state.asksById);
		asksById.set(action.ask.askId, action.ask);
		return appendEntry(state, permissionAskEvent(action.ask), { asksById });
	}
	if (action.type === 'permission-accepted') {
		const ask = state.asksById.get(action.accepted.askId);
		const decision =
			ask === undefined
				? null
				: permissionDecisionEvent(action.accepted, ask);
		if (decision === null) {
			return state;
		}
		const asksById = new Map(state.asksById);
		asksById.delete(action.accepted.askId);
		return appendEntry(state, decision, { asksById });
	}
	if (action.type === 'ask-user-ask') {
		const askUserById = new Map(state.askUserById);
		askUserById.set(action.ask.askId, action.ask);
		return appendEntry(state, askUserAskEvent(action.ask), {
			askUserById,
		});
	}
	const ask = state.askUserById.get(action.accepted.askId);
	const reply =
		ask === undefined ? null : askUserReplyEvent(action.accepted, ask);
	if (reply === null) {
		return state;
	}
	const askUserById = new Map(state.askUserById);
	askUserById.delete(action.accepted.askId);
	return appendEntry(state, reply, { askUserById });
};

const composeFeedProjection = (
	sources: FeedBridgeSources,
): Observable<FeedProjection> => {
	const catalog$ = combineLatest([
		sources.workflowSnapshot$,
		combineLatest([
			sources.paletteSnapshot$,
			sources.customPaletteSnapshot$,
		]).pipe(
			map(([system, custom]) => mergePaletteCatalogs(system, custom)),
		),
	]).pipe(
		map(([workflow, palette]) => feedCatalogFromSnaps(workflow, palette)),
		shareReplay({ bufferSize: 1, refCount: true }),
	);

	return merge(
		combineLatest([sources.executionFeedSnapshot$, catalog$]).pipe(
			distinctUntilChanged((prev, next) => prev[0] === next[0]),
			map(([snapshot, catalog]): FeedComposerAction =>
				snapshot === null
					? { type: 'clear' }
					: {
							type: 'snapshot',
							events: snapshot.events,
							runId: snapshot.runId,
							catalog,
						},
			),
		),
		catalog$.pipe(
			switchMap((catalog) =>
				sources.runnerPort$.pipe(
					map((event): FeedComposerAction => ({
						type: 'port',
						event,
						catalog,
					})),
				),
			),
		),
		catalog$.pipe(
			switchMap((catalog) =>
				sources.runnerStarted$.pipe(
					map((runId): FeedComposerAction => ({
						type: 'run-started',
						runId,
						catalog,
					})),
				),
			),
		),
		sources.permissionAsk$.pipe(
			map((ask): FeedComposerAction => ({ type: 'permission-ask', ask })),
		),
		sources.permissionAccepted$.pipe(
			map((accepted): FeedComposerAction => ({
				type: 'permission-accepted',
				accepted,
			})),
		),
		sources.askUserAsk$.pipe(
			map((ask): FeedComposerAction => ({ type: 'ask-user-ask', ask })),
		),
		sources.askUserAccepted$.pipe(
			map((accepted): FeedComposerAction => ({
				type: 'ask-user-accepted',
				accepted,
			})),
		),
		catalog$.pipe(
			map((catalog): FeedComposerAction => ({
				type: 'document',
				workflowId: catalog.workflowId ?? null,
				nodeIdsKey: workflowNodeIdsKey(catalog.nodeTypeById),
			})),
		),
	).pipe(
		scan(foldComposer, emptyComposer),
		startWith(emptyComposer),
		map((state) => state.projection),
		shareReplay({ bufferSize: 1, refCount: true }),
	);
};

export const foldExecutionFeed = (
	sources: FeedBridgeSources,
): {
	readonly nodeFeed$: Observable<readonly NodeFeedItem[]>;
	readonly feedRows$: Observable<readonly FeedRow[]>;
} => {
	const projection$ = composeFeedProjection(sources);
	return {
		nodeFeed$: projectNodeFeed(projection$),
		feedRows$: projectFeedRows(projection$),
	};
};
