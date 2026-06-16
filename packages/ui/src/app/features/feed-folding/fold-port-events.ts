import {
	STEER_CONTROL_PORT_ID,
	isSteerControlPayload,
} from '@langflower/node-sdk/llm';
import type {
	RunId,
	RuntimeFeedRole,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import type {
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from '@langflower/shared/langflower';
import { combineLatest, merge, type Observable } from 'rxjs';
import { map, scan, shareReplay, startWith } from 'rxjs/operators';
import { mergePaletteCatalogs } from '../palette/types/palette-projection';
import {
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
};

type FeedComposerAction =
	| {
			readonly type: 'snapshot';
			readonly events: readonly RuntimeRunnerEvent[];
	  }
	| { readonly type: 'clear' }
	| { readonly type: 'port'; readonly event: RuntimeRunnerEvent }
	| {
			readonly type: 'permission-ask';
			readonly ask: RunnerPermissionAskPayload;
	  }
	| {
			readonly type: 'permission-accepted';
			readonly accepted: RunnerPermissionReplyPayload;
	  }
	| { readonly type: 'catalog'; readonly catalog: FeedCatalog };

const emptyComposer: FeedComposerState = {
	entries: [],
	asksById: new Map(),
	catalog: null,
	projection: emptyFeedProjection(),
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

type RuntimePortFrame = Extract<
	RuntimeRunnerEvent,
	{ kind: 'output-emitted' | 'input-received' }
>;

const isRuntimeFeedRole = (role: string | undefined): role is RuntimeFeedRole =>
	role === 'none' ||
	role === 'reasoning' ||
	role === 'draft' ||
	role === 'tool' ||
	role === 'shell' ||
	role === 'result' ||
	role === 'recovery';

type RolePresentation =
	| 'omit'
	| 'data'
	| 'reasoning'
	| 'draft'
	| 'tool'
	| 'shell'
	| 'result'
	| 'recovery';

/**
 * Map author `RuntimeFeedRole` to UI presentation.
 * `none` → omit (caller returns null). Unmarked → technical `data`.
 */
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
	event: RuntimePortFrame,
	catalog: FeedCatalog,
): {
	readonly role: RuntimeFeedRole | undefined;
	readonly streaming: boolean;
} => {
	if (event.feed !== undefined) {
		const role = isRuntimeFeedRole(event.feed.role)
			? event.feed.role
			: undefined;
		return { role, streaming: event.feed.streaming === true };
	}
	const definition = definitionForNode(
		catalog.paletteByType,
		catalog.nodeTypeById,
		event.nodeId,
	);
	const configs =
		event.kind === 'output-emitted'
			? definition?.outputsConfigs
			: definition?.inputsConfigs;
	const config = configs?.find((entry) => entry.portId === event.portId);
	const rawRole = config?.feed?.role;
	const role = isRuntimeFeedRole(rawRole) ? rawRole : undefined;
	return { role, streaming: config?.feed?.streaming === true };
};

/** Non-streaming frames close the visit; streaming keeps it open. */
const withDerivedVisitClose = <T extends PortFrameMeta>(
	meta: T,
	streaming: boolean,
): T =>
	streaming ? meta : ({ ...meta, visitBoundary: 'close' as const } as T);

const catalogMeta = (
	event: RuntimePortFrame,
	catalog: FeedCatalog,
): PortFrameMeta | 'omit' => {
	if (event.state === 'error') {
		return withDerivedVisitClose({ presentation: 'error' }, false);
	}
	const resolved = resolveFeedMeta(event, catalog);
	const presentation = presentationFromRole(resolved.role);
	if (presentation === 'omit') {
		return 'omit';
	}
	return withDerivedVisitClose({ presentation }, resolved.streaming);
};

const normalizePortFrame = (
	event: RuntimePortFrame,
	catalog: FeedCatalog,
): PortEventFromServer | null => {
	if (typeof event.portId !== 'string') {
		return null;
	}
	// Pending wire noise (loading) — not a feed row.
	if (event.state === 'pending' && event.value === undefined) {
		return null;
	}
	const base = {
		source: 'port' as const,
		kind: event.kind,
		runId: event.runId,
		nodeId: event.nodeId,
		portId: event.portId,
		state: event.state,
		value: event.value,
	};

	if (
		event.portId === STEER_CONTROL_PORT_ID &&
		isSteerControlPayload(event.value)
	) {
		if (event.value.kind === 'pause') {
			return {
				...base,
				meta: withDerivedVisitClose(
					{ presentation: 'steering-pause', payload: event.value },
					false,
				),
			};
		}
		if (event.value.kind === 'steer') {
			return {
				...base,
				// Bubble shows the steer text; full control payload stays in meta.
				value: event.value.text.trim(),
				meta: withDerivedVisitClose(
					{
						presentation: 'hitl-user',
						origin: 'steer',
						payload: event.value,
					},
					false,
				),
			};
		}
		return {
			...base,
			meta: withDerivedVisitClose(
				{ presentation: 'steering-resume', payload: event.value },
				false,
			),
		};
	}

	const definition = definitionForNode(
		catalog.paletteByType,
		catalog.nodeTypeById,
		event.nodeId,
	);
	if (
		event.kind === 'input-received' &&
		definition !== undefined &&
		hitlReplyReceived(definition, event.portId)
	) {
		const input = definition.inputsConfigs.find(
			(entry) => entry.portId === event.portId,
		);
		const text = formatHitlUserText(definition, event.portId, event.value);
		return {
			...base,
			value: text,
			meta: withDerivedVisitClose(
				{ presentation: 'hitl-user', origin: 'hitl-reply' },
				input?.feed?.streaming === true,
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
	catalog: FeedCatalog,
): FeedEventFromSource | null => {
	if ('source' in entry) {
		return entry;
	}
	if (entry.kind !== 'output-emitted' && entry.kind !== 'input-received') {
		return null;
	}
	return normalizePortFrame(entry, catalog);
};

const normalizeEntries = (
	entries: readonly FeedSourceEntry[],
	catalog: FeedCatalog,
): readonly FeedEventFromSource[] =>
	entries.flatMap((entry) => {
		const normalized = normalizeEntry(entry, catalog);
		return normalized === null ? [] : [normalized];
	});

const rebuildProjection = (
	entries: readonly FeedSourceEntry[],
	catalog: FeedCatalog,
): FeedProjection => replayFeedProjection(normalizeEntries(entries, catalog));

const appendEntry = (
	state: FeedComposerState,
	entry: FeedSourceEntry,
	asksById: ReadonlyMap<string, RunnerPermissionAskPayload> = state.asksById,
): FeedComposerState => {
	const entries = [...state.entries, entry];
	if (state.catalog === null) {
		return { ...state, entries, asksById };
	}
	const normalized = normalizeEntry(entry, state.catalog);
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
		return {
			...state,
			catalog: action.catalog,
			projection: rebuildProjection(state.entries, action.catalog),
		};
	}
	if (action.type === 'clear') {
		return {
			...emptyComposer,
			catalog: state.catalog,
		};
	}
	if (action.type === 'snapshot') {
		const entries = action.events;
		const asksById = new Map<string, RunnerPermissionAskPayload>();
		return {
			entries,
			asksById,
			catalog: state.catalog,
			projection:
				state.catalog === null
					? emptyFeedProjection()
					: rebuildProjection(entries, state.catalog),
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
					: { type: 'snapshot', events: snapshot.events },
			),
		),
		sources.outputEmitted$.pipe(
			map((event): FeedComposerAction => ({ type: 'port', event })),
		),
		sources.inputReceived$.pipe(
			map((event): FeedComposerAction => ({ type: 'port', event })),
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
