import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
import type { NodeId, PortTelemetry, RunId } from '@langflower/runtime';
import { isPortTelemetry, isPortValueTelemetry } from '@langflower/runtime';
import type {
	PaletteNodeDefinition,
	RunnerPermissionAskPayload,
} from '@langflower/shared/langflower';
import { combineLatest, EMPTY, merge, Subject, type Observable } from 'rxjs';
import { filter, map, shareReplay, startWith } from 'rxjs/operators';
import { paletteByType as paletteNodesByType } from '../../services/bridge-diagram.service';
import { chatEntryNodeIdsInGraph } from '../../services/chat-entry-clusters';
import {
	definitionForNode,
	nodeTypeByIdFromWorkflow,
} from '../../services/execution-catalog';
import type { OutputPortTelemetry } from '../../services/execution-chrome-fold';
import {
	hitlControlsForNode,
	type HitlControlProjection,
} from '../../services/hitl-projection';
import { LangflowerBridgeService } from '../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../services/workflow-execution.service';
import { isQuietSince, QUIET_AFTER_MS } from '../sidebar/liveness';
import {
	emptyCustomPaletteSnapshot,
	mergePaletteCatalogs,
} from '../palette/types/palette-projection';
import { ExecutionFeedService } from '../feed-folding/execution-feed.service';
import { createHitlTriggeredNodes$ } from './execution-hitl-fold';
import { createPendingPermissionAsks$ } from './execution-permission-fold';
import { nodeInputString } from './node-input-string';

type InputPortTelemetry = PortTelemetry & {
	readonly 0: 'in';
	readonly 2: string;
	readonly 3: { readonly value: unknown };
};

/**
 * Composer HITL: tabs, drafts, Chat Input `node.inputs`, permissions, Pause.
 * Cross-feature run gate / live graph stay on {@link WorkflowExecutionService}.
 */
@Injectable({ providedIn: 'root' })
export class ComposerService {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly execution = inject(WorkflowExecutionService);
	private readonly executionFeed = inject(ExecutionFeedService);

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
	private readonly runnerPort$: Observable<PortTelemetry> = this.bridge.raw[
		'runner.port'
	].pipe(filter((event): event is PortTelemetry => isPortTelemetry(event)));
	private readonly outputEmitted$ = this.runnerPort$.pipe(
		filter((event): event is OutputPortTelemetry => event[0] === 'out'),
	);
	private readonly inputReceived$ = this.runnerPort$.pipe(
		filter(
			(event): event is InputPortTelemetry =>
				isPortValueTelemetry(event) &&
				event[0] === 'in' &&
				typeof event[2] === 'string',
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
	private readonly paletteByType = toSignal(this.paletteByType$, {
		initialValue: new Map<string, PaletteNodeDefinition>(),
	});
	private readonly nodeTypeById = toSignal(this.nodeTypeById$, {
		initialValue: new Map<string, string>(),
	});

	private readonly chatStartPending = signal(false);

	readonly idleChatEntryNodeIds = computed(() => {
		if (this.execution.isRunning() || this.chatStartPending()) {
			return [] as readonly string[];
		}
		const graph = this.execution.activeGraph();
		if (graph === null) {
			return [] as readonly string[];
		}
		return chatEntryNodeIdsInGraph(graph, this.paletteByType());
	});

	private readonly nodeFeed = toSignal(this.executionFeed.nodeFeed$, {
		initialValue: [],
	});

	private readonly hitlOpenLocal$ = new Subject<string>();
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

		this.execution.isRunning$
			.pipe(filter((running) => running))
			.subscribe(() => {
				this.chatStartPending.set(false);
			});
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
		for (const id of chatEntries) {
			if (!seen.has(id)) {
				seen.add(id);
				merged.push(id);
			}
		}
		return merged;
	}

	hitlControls(nodeId: string): readonly HitlControlProjection[] {
		const def = definitionForNode(
			this.paletteByType(),
			this.nodeTypeById(),
			nodeId,
		);
		return def !== undefined ? hitlControlsForNode(nodeId, def) : [];
	}

	pausableFeedIsQuiet(): boolean {
		const nodeId = this.pausableFeedNodeId();
		if (nodeId === null) {
			return false;
		}
		return isQuietSince(
			this.execution.lastActivityMs(nodeId),
			this.execution.livenessNowMs(),
			QUIET_AFTER_MS,
		);
	}

	composerText(nodeId: string, portId: string): string {
		if (this.isChatEntryNode(nodeId)) {
			return nodeInputString(
				this.execution.activeGraph(),
				nodeId,
				portId,
			);
		}

		return this.hitlDrafts().get(`${nodeId}:${portId}`) ?? '';
	}

	setComposerText(nodeId: string, portId: string, value: string): void {
		if (this.isChatEntryNode(nodeId)) {
			this.updateNodeInput(nodeId, portId, value);
			return;
		}

		this.hitlDrafts.update((current) => {
			const next = new Map(current);
			next.set(`${nodeId}:${portId}`, value);
			return next;
		});
	}

	private isChatEntryNode(nodeId: string): boolean {
		const nodeType = this.nodeTypeById().get(nodeId);
		if (nodeType === undefined) {
			return false;
		}
		return this.paletteByType().get(nodeType)?.chatEntry === true;
	}

	private updateNodeInput(
		nodeId: string,
		portId: string,
		value: string,
	): void {
		if (this.execution.isRunning()) {
			return;
		}
		const graph = this.execution.activeGraph();
		const node = graph?.nodes.find((entry) => entry.id === nodeId);
		if (node === undefined) {
			return;
		}
		this.bridge.raw['editor.updateNode.requested'].next({
			nodeId: nodeId as NodeId,
			inputs: { ...node.inputs, [portId]: value },
		});
	}

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

	private latestFeedNodeId(): string | null {
		return this.nodeFeed().at(-1)?.nodeId ?? null;
	}

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

	workingSteerNodeIds(): readonly string[] {
		const graph = this.execution.activeGraph();
		if (graph === null || !this.execution.isRunning()) {
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
		if (isChatEntry) {
			const persistValue =
				typeof payload === 'string'
					? payload
					: this.composerText(nodeId, portId);
			this.updateNodeInput(nodeId, portId, persistValue);
		}
		this.bridge.raw['runner.hitl.event']?.next({
			nodeId: nodeId as NodeId,
			portId,
			payload,
		});
		this.hitlResolveLocal$.next(nodeId);
		if (isChatEntry) {
			this.chatStartPending.set(true);
			return;
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
}
