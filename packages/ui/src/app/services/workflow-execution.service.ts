import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type {
	EdgeId,
	NodeId,
	RunId,
	RuntimePortSignalState,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import type {
	PaletteNodeDefinition,
	RunnerPermissionAskPayload,
	WorkflowPersistedGraph,
} from '@langflower/shared/langflower';
import {
	combineLatest,
	EMPTY,
	interval,
	merge,
	of,
	Subject,
	type Observable,
} from 'rxjs';
import { filter, map, scan, shareReplay, startWith } from 'rxjs/operators';
import {
	createLastActivityByNode$,
	type LivenessState,
} from './execution-liveness-fold.js';
import { isQuietSince, QUIET_AFTER_MS } from '../features/sidebar/liveness';
import { paletteByType as paletteNodesByType } from './bridge-diagram.service';
import {
	chatEntryNodeIdsInGraph,
	graphHasPlainStartTargets,
	nodeClusterRequiresChatEntry,
} from './chat-entry-clusters';
import {
	definitionForNode,
	nodeLabelsFromWorkflow,
	nodeTypeByIdFromWorkflow,
} from './execution-catalog';
import { createEdgeStates$ } from './execution-chrome-fold';
import { createHitlTriggeredNodes$ } from './execution-hitl-fold';
import { createPendingPermissionAsks$ } from './execution-permission-fold';
import { createIsRunning$ } from './execution-run-gate-fold';
import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
import {
	hitlControlsForNode,
	type HitlControlProjection,
} from './hitl-projection';
import {
	emptyCustomPaletteSnapshot,
	mergePaletteCatalogs,
} from '../features/palette/types/palette-projection';
import { LangflowerBridgeService } from './langflower-bridge.service';
import { ExecutionFeedService } from '../features/feed-folding/execution-feed.service';

type OutputEmittedEvent = Extract<
	RuntimeRunnerEvent,
	{ kind: 'output-emitted' }
>;
type InputReceivedEvent = Extract<
	RuntimeRunnerEvent,
	{ kind: 'input-received' }
>;

/**
 * Cross-feature execution façade: feed, edges, composer HITL, run gate.
 * Canvas **node** chrome lives in {@link CanvasNodeStatusService} (separate fold).
 *
 * Fold pipelines live in sibling `execution-*-fold.ts` / `execution-catalog.ts`
 * modules; this injectable wires bridge streams and exposes the UI façade.
 * The only mutable UI state here is HITL textarea drafts / chat-start pending.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowExecutionService {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly executionFeed = inject(ExecutionFeedService);

	// ── Raw bridge streams ─────────────────────────────────────────────
	// Wait for the real system `palette.snapshot` (no empty startWith) so feed
	// / HITL folds do not false-ready against an empty catalog. Custom may be
	// absent on older mocks — default to empty until the first custom snapshot.
	private readonly paletteSnapshot$ = combineLatest([
		this.bridge.cached['palette.snapshot'],
		this.bridge.cached['customPalette.snapshot'].pipe(
			startWith(emptyCustomPaletteSnapshot),
		),
	]).pipe(
		map(([system, custom]) => mergePaletteCatalogs(system, custom)),
		shareReplay(1),
	);
	private readonly workflowSnapshot$ =
		this.bridge.cached['workflow.current.snapshot'];
	private readonly executionFeedSnapshot$ =
		this.bridge.cached['executionFeed.snapshot'];
	private readonly outputEmitted$ = this.bridge.raw[
		'runner.output-emitted'
	].pipe(filter((e): e is OutputEmittedEvent => e.kind === 'output-emitted'));
	private readonly inputReceived$ = this.bridge.raw[
		'runner.input-received'
	].pipe(
		filter(
			(e): e is InputReceivedEvent & { portId: string } =>
				e.kind === 'input-received' &&
				typeof e.portId === 'string' &&
				e.state === 'value',
		),
	);
	private readonly runnerStarted$ = this.bridge.raw['runner.started'].pipe(
		filter((id): id is RunId => typeof id === 'string'),
	);
	private readonly runnerStartNodeStarted$ = this.bridge.raw[
		'runner.startNode.started'
	].pipe(filter((id): id is RunId => typeof id === 'string'));
	private readonly runnerDone$ = this.bridge.raw['runner.done'];
	private readonly runnerInterrupted$ = this.bridge.raw['runner.interrupted'];
	private readonly permissionAsk$ =
		this.bridge.raw['runner.permission.ask'] ?? EMPTY;
	private readonly permissionAccepted$ =
		this.bridge.raw['runner.permission.accepted'] ?? EMPTY;

	// ── Derived lookup maps (UI signals only — not for feed/HITL classify) ─
	// Classification uses raw workflow/palette Subjects via feedCatalogFromSnaps
	// / switchMap so bootstrap never pairs events with startWith(empty) maps
	// (BUG-2026-07-21b). These streams keep empty initials for remount-safe
	// computed gates (hasRunnableGraph, idle chat-entry).
	private readonly paletteByType$ = this.paletteSnapshot$.pipe(
		map((snap) => paletteNodesByType(snap.nodes)),
		startWith(new Map<string, PaletteNodeDefinition>()),
		shareReplay(1),
	);

	private readonly nodeTypeById$ = this.workflowSnapshot$.pipe(
		map((snap) => nodeTypeByIdFromWorkflow(snap)),
		startWith(new Map<string, string>()),
		shareReplay(1),
	);

	/** Active workflow graph for late Inspector mounts (wired-tools, etc.). */
	private readonly activeGraph$ = this.workflowSnapshot$.pipe(
		map((snap) => snap.activeWorkflow?.graph ?? null),
		startWith(null as WorkflowPersistedGraph | null),
		shareReplay({ bufferSize: 1, refCount: false }),
	);

	private readonly nodeLabels$ = merge(
		of(new Map<string, string>()),
		combineLatest([this.workflowSnapshot$, this.paletteSnapshot$]).pipe(
			map(([workflowSnap, paletteSnap]) =>
				nodeLabelsFromWorkflow(
					workflowSnap,
					paletteNodesByType(paletteSnap.nodes),
				),
			),
		),
	).pipe(shareReplay(1));

	private readonly paletteByType = toSignal(this.paletteByType$, {
		initialValue: new Map<string, PaletteNodeDefinition>(),
	});
	private readonly nodeTypeById = toSignal(this.nodeTypeById$, {
		initialValue: new Map<string, string>(),
	});
	private readonly nodeLabels = toSignal(this.nodeLabels$, {
		initialValue: new Map<string, string>(),
	});

	/**
	 * Active workflow graph for Inspector (wired tools, etc.). Replays the last
	 * `workflow.current.snapshot` so a late-mounted panel is not empty.
	 */
	readonly activeGraph = toSignal(this.activeGraph$, {
		initialValue: null as WorkflowPersistedGraph | null,
	});

	/**
	 * Whether the active workflow has at least one node — used by Run/Stop so a
	 * remounted button does not stay disabled waiting for a replayed
	 * `workflow.current.snapshot`.
	 */
	readonly hasRunnableGraph = computed(() => this.nodeTypeById().size > 0);

	/**
	 * Whether plain Run has a non-chat-entry cluster to start. Chat-entry
	 * clusters start only from the composer (`pushIntoInput`).
	 */
	readonly hasPlainStartTargets = computed(() => {
		const graph = this.activeGraph();
		if (graph === null) {
			return false;
		}
		return graphHasPlainStartTargets(graph, this.paletteByType());
	});

	/**
	 * Suppresses idle chat-entry tabs between Send and `runner.started` so the
	 * composer does not flicker open again before `isRunning` flips.
	 */
	private readonly chatStartPending = signal(false);

	/**
	 * Idle chat-entry node ids (composer cold-start). Empty while a run is
	 * active — mid-run human input uses triggered HITL nodes instead.
	 */
	readonly idleChatEntryNodeIds = computed(() => {
		if (this.isRunning() || this.chatStartPending()) {
			return [] as readonly string[];
		}
		const graph = this.activeGraph();
		if (graph === null) {
			return [] as readonly string[];
		}
		return chatEntryNodeIdsInGraph(graph, this.paletteByType());
	});

	private readonly nodeFeed = toSignal(this.executionFeed.nodeFeed$, {
		initialValue: [],
	});

	private readonly latestOutputValues = toSignal(
		merge(
			this.executionFeedSnapshot$.pipe(
				map((snapshot) => ({
					type: 'snapshot' as const,
					events: snapshot?.events ?? [],
				})),
			),
			this.outputEmitted$.pipe(
				map((event) => ({ type: 'event' as const, event })),
			),
		).pipe(
			scan((values, action) => {
				if (action.type === 'snapshot') {
					const next = new Map<string, unknown>();
					for (const event of action.events) {
						if (
							event.kind === 'output-emitted' &&
							typeof event.portId === 'string' &&
							event.state === 'value'
						) {
							next.set(
								`${event.nodeId}:${event.portId}`,
								event.value,
							);
						}
					}
					return next;
				}
				if (
					typeof action.event.portId !== 'string' ||
					action.event.state !== 'value'
				) {
					return values;
				}
				const next = new Map(values);
				next.set(
					`${action.event.nodeId}:${action.event.portId}`,
					action.event.value,
				);
				return next;
			}, new Map<string, unknown>()),
		),
		{ initialValue: new Map<string, unknown>() },
	);

	private readonly lastActivityByNode$ = createLastActivityByNode$({
		outputEmitted$: this.outputEmitted$,
		runnerStarted$: this.runnerStarted$,
		runnerStartNodeStarted$: this.runnerStartNodeStarted$,
		executionFeedSnapshot$: this.executionFeedSnapshot$,
	});

	private readonly lastActivityByNode = toSignal(this.lastActivityByNode$, {
		initialValue: new Map() as LivenessState,
	});

	/** 1s tick so liveness / quiet tips recompute without new feed events. */
	readonly livenessNowMs = toSignal(
		interval(1000).pipe(map(() => Date.now())),
		{
			initialValue: Date.now(),
		},
	);

	private readonly isRunning$ = createIsRunning$({
		executionFeedSnapshot$: this.executionFeedSnapshot$,
		runnerStarted$: this.runnerStarted$,
		runnerStartNodeStarted$: this.runnerStartNodeStarted$,
		runnerDone$: this.runnerDone$,
		runnerInterrupted$: this.runnerInterrupted$,
	});

	readonly isRunning = toSignal(this.isRunning$, { initialValue: false });

	private readonly edgeStates$ = createEdgeStates$({
		executionFeedSnapshot$: this.executionFeedSnapshot$,
		outputEmitted$: this.outputEmitted$,
		runnerStarted$: this.runnerStarted$,
		runnerStartNodeStarted$: this.runnerStartNodeStarted$,
	});

	readonly edgeStates = toSignal(this.edgeStates$, {
		initialValue: new Map<EdgeId, RuntimePortSignalState>(),
	});

	/**
	 * Optimistic composer open (soft Pause) before `input-received` round-trips.
	 */
	private readonly hitlOpenLocal$ = new Subject<string>();

	/**
	 * Optimistic composer close after the user submits a reply (before the
	 * matching `input-received` round-trips from the server).
	 */
	private readonly hitlResolveLocal$ = new Subject<string>();

	private readonly hitlTriggeredNodes$ = createHitlTriggeredNodes$({
		workflowSnapshot$: this.workflowSnapshot$,
		paletteSnapshot$: this.paletteSnapshot$,
		executionFeedSnapshot$: this.executionFeedSnapshot$,
		inputReceived$: this.inputReceived$,
		outputEmitted$: this.outputEmitted$,
		runnerStarted$: this.runnerStarted$,
		runnerStartNodeStarted$: this.runnerStartNodeStarted$,
		runnerDone$: this.runnerDone$,
		runnerInterrupted$: this.runnerInterrupted$,
		hitlOpenLocal$: this.hitlOpenLocal$,
		hitlResolveLocal$: this.hitlResolveLocal$,
	});

	private readonly hitlTriggeredNodes = toSignal(this.hitlTriggeredNodes$, {
		initialValue: new Set<string>(),
	});

	/**
	 * In-progress textarea drafts for HITL text inputs, keyed by
	 * `${nodeId}:${portId}`. UI-only — not derived from the bridge.
	 */
	private readonly hitlDrafts = signal<ReadonlyMap<string, string>>(
		new Map(),
	);

	private readonly pendingPermissionAsks$ = createPendingPermissionAsks$({
		permissionAsk$: this.permissionAsk$,
		permissionAccepted$: this.permissionAccepted$,
		runnerDone$: this.runnerDone$,
		runnerInterrupted$: this.runnerInterrupted$,
		runnerStarted$: this.runnerStarted$,
		runnerStartNodeStarted$: this.runnerStartNodeStarted$,
	});

	readonly pendingPermissionAsks = toSignal(this.pendingPermissionAsks$, {
		initialValue: [] as readonly RunnerPermissionAskPayload[],
	});

	constructor() {
		merge(this.runnerDone$, this.runnerInterrupted$).subscribe(() => {
			this.hitlDrafts.set(new Map());
			this.chatStartPending.set(false);
		});

		// Clear optimistic chat-start once the runner is live (no `effect` —
		// keeps unit tests free of ChangeDetectionScheduler).
		this.isRunning$.pipe(filter((running) => running)).subscribe(() => {
			this.chatStartPending.set(false);
		});
	}

	// ── Public query methods ──────────────────────────────────────────

	latestOutputValue(nodeId: string, portId: string): unknown {
		return this.latestOutputValues().get(`${nodeId}:${portId}`);
	}

	hitlTriggered(nodeId: string): boolean {
		return (
			this.hitlTriggeredNodes().has(nodeId) ||
			this.idleChatEntryNodeIds().includes(nodeId)
		);
	}

	hitlTriggeredNodeIds(): readonly string[] {
		const awaiting = [...this.hitlTriggeredNodes()];
		const chatEntries = this.idleChatEntryNodeIds();
		if (chatEntries.length === 0) {
			return awaiting;
		}
		const seen = new Set(awaiting);
		const merged = [...awaiting];
		for (const nodeId of chatEntries) {
			if (!seen.has(nodeId)) {
				seen.add(nodeId);
				merged.push(nodeId);
			}
		}
		return merged;
	}

	/** True when Run-from-node would target a chat-entry cluster. */
	nodeClusterRequiresChatEntry(nodeId: string): boolean {
		const graph = this.activeGraph();
		if (graph === null) {
			return false;
		}
		return nodeClusterRequiresChatEntry(
			graph,
			this.paletteByType(),
			nodeId,
		);
	}

	hitlControls(nodeId: string): readonly HitlControlProjection[] {
		const def = definitionForNode(
			this.paletteByType(),
			this.nodeTypeById(),
			nodeId,
		);
		return def !== undefined ? hitlControlsForNode(nodeId, def) : [];
	}

	nodeLabel(nodeId: string): string {
		return this.nodeLabels().get(nodeId) ?? nodeId;
	}

	/** Client wall-clock of last `output-emitted` for this node, if any. */
	lastActivityMs(nodeId: string): number | undefined {
		return this.lastActivityByNode().get(nodeId);
	}

	/**
	 * True when the pausable feed agent has had no output for
	 * {@link QUIET_AFTER_MS} — softens the Pause tip.
	 */
	pausableFeedIsQuiet(): boolean {
		const nodeId = this.pausableFeedNodeId();
		if (nodeId === null) {
			return false;
		}
		return isQuietSince(
			this.lastActivityMs(nodeId),
			this.livenessNowMs(),
			QUIET_AFTER_MS,
		);
	}

	hitlDraft(nodeId: string, portId: string): string {
		return this.hitlDrafts().get(`${nodeId}:${portId}`) ?? '';
	}

	setHitlDraft(nodeId: string, portId: string, value: string): void {
		this.hitlDrafts.update((current) => {
			const next = new Map(current);
			next.set(`${nodeId}:${portId}`, value);
			return next;
		});
	}

	/**
	 * Soft Pause (ADR-032): per-node `{ kind: 'pause' }` on `steerControl` for
	 * the last feed section's agent only (`pausableFeedNodeId`). Not a global
	 * run pause — other working agents keep running. Optimistic HITL open +
	 * feed settle run in the same folds before echo.
	 */
	requestSoftPause(): void {
		const nodeId = this.pausableFeedNodeId();
		if (nodeId === null) {
			return;
		}
		this.hitlOpenLocal$.next(nodeId);
		this.bridge.raw['runner.hitl.event']?.next({
			nodeId: nodeId as NodeId,
			portId: STEER_CONTROL_PORT_ID,
			payload: { kind: 'pause' },
		});
	}

	/** `nodeId` of the last feed section, if any. */
	latestFeedNodeId(): string | null {
		return this.nodeFeed().at(-1)?.nodeId ?? null;
	}

	/**
	 * Last feed section's node when it is a working `steerControl` agent that
	 * is not already in HITL/Steer await. Pause target for sequential A→B.
	 */
	pausableFeedNodeId(): string | null {
		const latest = this.latestFeedNodeId();
		if (latest === null) {
			return null;
		}
		if (this.hitlTriggeredNodeIds().includes(latest)) {
			return null;
		}
		return this.workingSteerNodeIds().includes(latest) ? latest : null;
	}

	/**
	 * In-flight agents that expose `steerControl` (eligibility for Pause).
	 * Uses open feed visits — not canvas chrome status.
	 */
	workingSteerNodeIds(): readonly string[] {
		const graph = this.activeGraph();
		if (graph === null || !this.isRunning()) {
			return [];
		}
		const activeFeedNodeIds = new Set(
			this.nodeFeed()
				.filter((visit) => !visit.isClosed)
				.map((visit) => visit.nodeId),
		);
		const ids: string[] = [];
		for (const node of graph.nodes) {
			if (!activeFeedNodeIds.has(node.id)) {
				continue;
			}
			if (this.hitlTriggered(node.id)) {
				continue;
			}
			const def = this.paletteByType().get(node.type);
			if (
				def?.inputsConfigs.some(
					(entry) => entry.portId === STEER_CONTROL_PORT_ID,
				)
			) {
				ids.push(node.id);
			}
		}
		return ids;
	}

	submitHitl(
		event: readonly [nodeId: string, portId: string, payload: unknown],
	): void {
		const nodeId = event[0];
		const portId = event[1];
		const rawPayload = event[2];
		const payload =
			portId === STEER_CONTROL_PORT_ID && typeof rawPayload === 'string'
				? { kind: 'steer' as const, text: rawPayload }
				: rawPayload;
		const nodeType = this.nodeTypeById().get(nodeId);
		const def =
			nodeType !== undefined
				? this.paletteByType().get(nodeType)
				: undefined;
		const isChatEntry = def?.chatEntry === true;
		this.bridge.raw['runner.hitl.event']?.next({
			nodeId: nodeId as NodeId,
			portId,
			payload,
		});
		// Close the composer immediately; runtime `input-received` on the HITL
		// port confirms the same transition for reconnect / other tabs.
		this.hitlResolveLocal$.next(nodeId);
		if (isChatEntry) {
			this.chatStartPending.set(true);
		}
		this.hitlDrafts.update((current) => {
			const prefix = `${nodeId}:`;
			const next = new Map<string, string>();
			for (const [key, value] of current) {
				if (!key.startsWith(prefix)) {
					next.set(key, value);
				}
			}
			return next;
		});
	}

	/** Allow or deny a pending runtime permission ask (tool-loop gate). */
	submitPermissionReply(
		ask: RunnerPermissionAskPayload,
		decision: 'allow' | 'deny',
	): void {
		this.bridge.raw['runner.permission.reply']?.next({
			runId: ask.runId,
			askId: ask.askId,
			decision,
		});
	}

	wireStatus(edgeId: string): 'inactive' | 'pending' | 'value' | 'error' {
		return this.edgeStates().get(edgeId as EdgeId) ?? 'inactive';
	}

	getEventsForEdge(edgeId: string): Observable<OutputEmittedEvent> {
		return this.outputEmitted$.pipe(
			filter((e) => (e.edgeIds ?? []).includes(edgeId as EdgeId)),
		);
	}

	/**
	 * Live `output-emitted` for one runtime output port (bare `portId`, not
	 * diagram `out:…`). Drives port-row pulse; steady chrome stays on folds.
	 */
	getEventsForPort(
		nodeId: string,
		portId: string,
	): Observable<OutputEmittedEvent> {
		return this.outputEmitted$.pipe(
			filter((e) => e.nodeId === nodeId && e.portId === portId),
		);
	}

	/**
	 * Live `input-received` value events for one runtime input port (bare
	 * `portId`, not diagram `in:…`).
	 */
	getInputEventsForPort(
		nodeId: string,
		portId: string,
	): Observable<InputReceivedEvent & { portId: string }> {
		return this.inputReceived$.pipe(
			filter((e) => e.nodeId === nodeId && e.portId === portId),
		);
	}
}
