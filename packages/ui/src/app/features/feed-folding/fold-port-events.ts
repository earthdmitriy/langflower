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
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from '@langflower/shared/langflower';
import { combineLatest, merge, type Observable } from 'rxjs';
import { map, scan, shareReplay, startWith } from 'rxjs/operators';
import { mergePaletteCatalogs } from '../palette/types/palette-projection';
import {
	catalogSwitchedDocument,
	definitionForNode,
	feedCatalogFromSnaps,
	formatHitlUserText,
	type FeedCatalog,
} from '../../services/execution-catalog';
import { hitlReplyReceived } from '../../services/hitl-projection';
import { projectNodeFeed } from './operators/feed-folding-operators';
import {
	appendFeedFrame,
	emptyFeedProjection,
	replayFeedProjection,
	type FeedProjection,
} from './operators/feed-projection';
import type {
	FeedEventFromSource,
	FeedBridgeSources,
	NodeFeedItem,
	PermissionFeedEvent,
	PortEventFromServer,
	PortFrameMeta,
} from './types';

type FeedSourceEntry = RuntimeRunnerEvent | PermissionFeedEvent;

type FeedComposerState = {
	readonly entries: readonly FeedSourceEntry[];
	readonly asksById: ReadonlyMap<string, RunnerPermissionAskPayload>;
	readonly catalog: FeedCatalog | null;
	readonly projection: FeedProjection;
	readonly runId: RunId | null;
};

type FeedComposerAction =
	| {
			readonly type: 'snapshot';
			readonly events: readonly RuntimeRunnerEvent[];
			readonly runId: RunId | null;
	  }
	| { readonly type: 'clear' }
	| { readonly type: 'port'; readonly event: PortTelemetry }
	| {
			readonly type: 'permission-ask';
			readonly ask: RunnerPermissionAskPayload;
	  }
	| {
			readonly type: 'permission-accepted';
			readonly accepted: RunnerPermissionReplyPayload;
	  }
	| { readonly type: 'catalog'; readonly catalog: FeedCatalog }
	| { readonly type: 'run-started'; readonly runId: RunId };

const emptyComposer: FeedComposerState = {
	entries: [],
	asksById: new Map(),
	catalog: null,
	projection: emptyFeedProjection(),
	runId: null,
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

const isRuntimeFeedRole = (role: string | undefined): role is RuntimeFeedRole =>
	role === 'none' ||
	role === 'reasoning' ||
	role === 'progress' ||
	role === 'draft' ||
	role === 'tool' ||
	role === 'shell' ||
	role === 'result' ||
	role === 'recovery';

type RolePresentation =
	| 'omit'
	| 'data'
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
	if (role === 'none') {
		return 'omit';
	}
	if (role === undefined) {
		return 'data';
	}
	return role;
};

const resolveFeedMeta = (
	event: PortTelemetry,
	catalog: FeedCatalog,
): {
	readonly role: RuntimeFeedRole | undefined;
	readonly streaming: boolean;
} => {
	const [, nodeId, portId, , , , feedMeta] = event;
	if (feedMeta != null) {
		const role = isRuntimeFeedRole(feedMeta.role)
			? feedMeta.role
			: undefined;
		return { role, streaming: feedMeta.streaming === true };
	}
	const definition = definitionForNode(
		catalog.paletteByType,
		catalog.nodeTypeById,
		nodeId,
	);
	const portDir = event[0];
	const configs =
		portDir === 'out'
			? definition?.outputsConfigs
			: definition?.inputsConfigs;
	const config = configs?.find((entry) => entry.portId === portId);
	const rawRole = config?.feed?.role;
	const role = isRuntimeFeedRole(rawRole) ? rawRole : undefined;
	return { role, streaming: config?.feed?.streaming === true };
};

const SUB_AGENT_NODE_TYPE = 'common-sub-agent';

const withClosesPreviousVisit = <T extends PortFrameMeta>(
	meta: T,
	catalog: FeedCatalog,
	nodeId: string,
): T =>
	catalog.nodeTypeById.get(nodeId) === SUB_AGENT_NODE_TYPE
		? ({ ...meta, closesPreviousVisit: true as const } as T)
		: meta;

const withDerivedVisitClose = <T extends PortFrameMeta>(
	meta: T,
	streaming: boolean,
): T =>
	streaming ? meta : ({ ...meta, visitBoundary: 'close' as const } as T);

const catalogMeta = (
	event: PortTelemetry,
	catalog: FeedCatalog,
): PortFrameMeta | 'omit' => {
	const [, nodeId, , response] = event;
	if ('error' in response) {
		return withClosesPreviousVisit(
			withDerivedVisitClose({ presentation: 'error' }, false),
			catalog,
			nodeId,
		);
	}
	const resolved = resolveFeedMeta(event, catalog);
	const presentation = presentationFromRole(resolved.role);
	if (presentation === 'omit') {
		return 'omit';
	}
	return withClosesPreviousVisit(
		withDerivedVisitClose({ presentation }, resolved.streaming),
		catalog,
		nodeId,
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
					catalog,
					nodeId,
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
					catalog,
					nodeId,
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
				catalog,
				nodeId,
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
		const input = definition.inputsConfigs.find(
			(entry) => entry.portId === portId,
		);
		const text = formatHitlUserText(definition, portId, value);
		return {
			...base,
			value: text,
			meta: withClosesPreviousVisit(
				withDerivedVisitClose(
					{ presentation: 'hitl-user', origin: 'hitl-reply' },
					input?.feed?.streaming === true,
				),
				catalog,
				nodeId,
			),
		};
	}

	const meta = catalogMeta(event, catalog);
	if (meta === 'omit') {
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

const normalizeEntries = (
	entries: readonly FeedSourceEntry[],
	runId: RunId | null,
	catalog: FeedCatalog,
): readonly FeedEventFromSource[] =>
	entries.flatMap((entry) => {
		const normalized = normalizeEntry(entry, runId, catalog);
		return normalized === null ? [] : [normalized];
	});

const rebuildProjection = (
	entries: readonly FeedSourceEntry[],
	runId: RunId | null,
	catalog: FeedCatalog,
): FeedProjection =>
	replayFeedProjection(normalizeEntries(entries, runId, catalog));

const appendEntry = (
	state: FeedComposerState,
	entry: FeedSourceEntry,
	asksById: ReadonlyMap<string, RunnerPermissionAskPayload> = state.asksById,
): FeedComposerState => {
	const entries = [...state.entries, entry];
	if (state.catalog === null || state.runId === null) {
		return { ...state, entries, asksById };
	}
	const normalized = normalizeEntry(entry, state.runId, state.catalog);
	if (normalized === null) {
		return { ...state, entries, asksById };
	}
	return {
		...state,
		entries,
		asksById,
		projection: appendFeedFrame(state.projection, normalized),
	};
};

const foldComposer = (
	state: FeedComposerState,
	action: FeedComposerAction,
): FeedComposerState => {
	if (action.type === 'catalog') {
		if (catalogSwitchedDocument(state.catalog, action.catalog)) {
			return {
				...emptyComposer,
				catalog: action.catalog,
			};
		}
		return {
			...state,
			catalog: action.catalog,
			projection: rebuildProjection(
				state.entries,
				state.runId,
				action.catalog,
			),
		};
	}
	if (action.type === 'clear') {
		return {
			...emptyComposer,
			catalog: state.catalog,
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
				projection:
					state.catalog === null
						? state.projection
						: rebuildProjection(
								state.entries,
								action.runId,
								state.catalog,
							),
			};
		}
		return {
			...emptyComposer,
			catalog: state.catalog,
			runId: action.runId,
		};
	}
	if (action.type === 'snapshot') {
		const entries = action.events;
		const asksById = new Map<string, RunnerPermissionAskPayload>();
		return {
			entries,
			asksById,
			catalog: state.catalog,
			runId: action.runId,
			projection:
				state.catalog === null || action.runId === null
					? emptyFeedProjection()
					: rebuildProjection(entries, action.runId, state.catalog),
		};
	}
	if (action.type === 'port') {
		return appendEntry(state, action.event);
	}
	if (action.type === 'permission-ask') {
		const asksById = new Map(state.asksById);
		asksById.set(action.ask.askId, action.ask);
		return appendEntry(state, permissionAskEvent(action.ask), asksById);
	}

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
	return appendEntry(state, decision, asksById);
};

export const foldPortEventsToNodeFeed = (
	sources: FeedBridgeSources,
): Observable<readonly NodeFeedItem[]> => {
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

	const projection$ = merge(
		sources.executionFeedSnapshot$.pipe(
			map((snapshot): FeedComposerAction =>
				snapshot === null
					? { type: 'clear' }
					: {
							type: 'snapshot',
							events: snapshot.events,
							runId: snapshot.runId,
						},
			),
		),
		sources.runnerPort$.pipe(
			map((event): FeedComposerAction => ({ type: 'port', event })),
		),
		sources.runnerStarted$.pipe(
			map((runId): FeedComposerAction => ({
				type: 'run-started',
				runId,
			})),
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
		catalog$.pipe(
			map((catalog): FeedComposerAction => ({
				type: 'catalog',
				catalog,
			})),
		),
	).pipe(
		scan(foldComposer, emptyComposer),
		startWith(emptyComposer),
		map((state) => state.projection),
		shareReplay({ bufferSize: 1, refCount: true }),
	);

	return projectNodeFeed(projection$);
};
