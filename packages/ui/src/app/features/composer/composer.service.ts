import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { HitlInputConfig, HitlUploadedFile } from '@langflower/node-sdk';
import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
import type { NodeId, PortTelemetry, RunId } from '@langflower/runtime';
import { isPortTelemetry, isPortValueTelemetry } from '@langflower/runtime';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import type {
	RunnerAskUserAskPayload,
	RunnerPermissionAskPayload,
} from '@langflower/shared/types/langflower-config';
import { EMPTY, merge, Subject, type Observable } from 'rxjs';
import { filter, map, scan, shareReplay, startWith } from 'rxjs/operators';
import { paletteByType as paletteNodesByType } from '../../services/execution-catalog';
import { chatEntryNodeIdsInGraph } from '../../services/chat-entry-clusters';
import {
	definitionForNode,
	mergedPaletteFromSnapshots$,
	nodeTypeByIdFromGraph,
} from '../../services/execution-catalog';
import type {
	InputPortTelemetry,
	OutputPortTelemetry,
} from '../../services/execution-chrome-fold';
import {
	hitlControlsForNode,
	type HitlControlProjection,
} from '../../services/hitl-projection';
import { LangflowerBridgeService } from '../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../services/workflow-execution.service';
import { isQuietSince, QUIET_AFTER_MS } from './liveness';
import {
	foldComposerDrafts,
	initialComposerDraftsState,
	type ComposerDraftsAction,
} from './composer-drafts-fold';
import { ExecutionFeedService } from '../feed-folding/execution-feed.service';
import { createHitlTriggeredNodes$ } from './execution-hitl-fold';
import { createPendingAskUserAsks$ } from './execution-ask-user-fold';
import { createPendingPermissionAsks$ } from './execution-permission-fold';
import { composerAwaitingNodeIds } from './composer-awaiting-node-ids';
import { navigationLocked as isNavigationLocked } from './composer-footer-mode';
import {
	isSteerControlTextarea,
	resolveComposerActionPayload,
	textareaAcceptsFiles,
	resolveComposerEnterPayload,
	wrapSteerHitlPayload,
} from './hitl-action-payload';
import { nodeInputString } from './node-input-string';
import {
	acceptUploadFiles,
	appendAcceptedUploads,
	postSessionUpload,
	stageComposerUploads,
} from '../../utils/session-upload';

const isComposerUserTurn = (
	payload: unknown,
): payload is { readonly text: string; readonly files: readonly unknown[] } =>
	typeof payload === 'object' &&
	payload !== null &&
	'text' in payload &&
	typeof payload.text === 'string' &&
	'files' in payload &&
	Array.isArray(payload.files) &&
	!('kind' in payload);

/** Synthetic HITL port id for composer drafts while `ask_user` is pending. */
export const ASK_USER_COMPOSER_PORT_ID = 'ask_user';

export const ASK_USER_TEXTAREA_CONFIG: HitlInputConfig = {
	title: 'Ask user',
	kind: 'textarea',
	submitLabel: 'Send',
	placeholder: 'Reply to the agent…',
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

	/** Wait for real system + custom snapshots — no empty custom startWith. */
	private readonly paletteSnapshot$ = mergedPaletteFromSnapshots$(
		this.bridge.cached['palette.snapshot'],
		this.bridge.cached['customPalette.snapshot'],
	).pipe(shareReplay(1));
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
	private readonly askUserAsk$ =
		this.bridge.raw['runner.askUser.ask'] ?? EMPTY;
	private readonly askUserAccepted$ =
		this.bridge.raw['runner.askUser.accepted'] ?? EMPTY;

	private readonly paletteByType$ = this.paletteSnapshot$.pipe(
		map((snap) => paletteNodesByType(snap.nodes)),
		shareReplay(1),
	);
	private readonly paletteByType = toSignal(this.paletteByType$, {
		initialValue: new Map<string, PaletteNodeDefinition>(),
	});
	/** Live graph, not the snapshot: nodes added after load arrive as deltas. */
	private readonly nodeTypeById = computed(() =>
		nodeTypeByIdFromGraph(this.execution.activeGraph()),
	);

	private readonly draftActions$ = new Subject<ComposerDraftsAction>();

	private readonly draftState$ = merge(
		merge(this.runnerDone$, this.runnerInterrupted$).pipe(
			map((): ComposerDraftsAction => ({ type: 'runnerSettled' })),
		),
		this.execution.isRunning$.pipe(
			filter((running) => running),
			map((): ComposerDraftsAction => ({ type: 'runStarted' })),
		),
		this.draftActions$,
	).pipe(
		scan(foldComposerDrafts, initialComposerDraftsState),
		startWith(initialComposerDraftsState),
		shareReplay(1),
	);

	private readonly draftState = toSignal(this.draftState$, {
		initialValue: initialComposerDraftsState,
	});

	readonly uploading = signal(false);
	readonly uploadError = signal<string | null>(null);

	readonly idleChatEntryNodeIds = computed(() => {
		if (this.execution.isRunning() || this.draftState().chatStartPending) {
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

	private readonly pendingAskUserAsks$ = createPendingAskUserAsks$({
		askUserAsk$: this.askUserAsk$,
		askUserAccepted$: this.askUserAccepted$,
		runnerDone$: this.runnerDone$,
		runnerInterrupted$: this.runnerInterrupted$,
		runnerStarted$: this.runnerStarted$,
		runnerStartNodeStarted$: this.runnerStartNodeStarted$,
	});

	readonly pendingAskUserAsks = toSignal(this.pendingAskUserAsks$, {
		initialValue: [] as readonly RunnerAskUserAskPayload[],
	});

	/** True only while the graph is executing, not while it waits on a person. */
	readonly navigationLocked = computed(() =>
		isNavigationLocked({
			hasPermissionAsk: this.pendingPermissionAsks().length > 0,
			hasAskUser: this.pendingAskUserAsks().length > 0,
			isRunning: this.execution.isRunning(),
			hitlTabCount: this.hitlTriggeredNodes().size,
		}),
	);

	/** Gates opened by the feed. Idle chat-entry prompts are not included. */
	hasAwaitingHitl(): boolean {
		return this.hitlTriggeredNodes().size > 0;
	}

	hitlTriggered(nodeId: string): boolean {
		return this.hitlTriggeredNodeIds().includes(nodeId);
	}

	hitlTriggeredNodeIds(): readonly string[] {
		return composerAwaitingNodeIds(
			this.hitlTriggeredNodes(),
			this.idleChatEntryNodeIds(),
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

		return this.draftState().drafts.get(`${nodeId}:${portId}`) ?? '';
	}

	attachmentsFor(nodeId: string, portId: string): readonly File[] {
		return this.draftState().attachments.get(`${nodeId}:${portId}`) ?? [];
	}

	/** Attach, paste, and drop for a textarea that takes files. */
	showsComposerAttachments(entry: HitlControlProjection): boolean {
		return textareaAcceptsFiles(entry);
	}

	addAttachments(
		nodeId: string,
		portId: string,
		picked: readonly File[],
	): void {
		const accepted = acceptUploadFiles(picked);
		if (accepted.length === 0) {
			return;
		}
		const key = `${nodeId}:${portId}`;
		this.draftActions$.next({
			type: 'setAttachments',
			key,
			files: appendAcceptedUploads(
				this.attachmentsFor(nodeId, portId),
				accepted,
			),
		});
	}

	removeAttachment(nodeId: string, portId: string, index: number): void {
		const next = this.attachmentsFor(nodeId, portId).filter(
			(_, fileIndex) => fileIndex !== index,
		);
		this.draftActions$.next({
			type: 'setAttachments',
			key: `${nodeId}:${portId}`,
			files: next,
		});
	}

	/**
	 * Textarea Send/Start/Enter. Chat Input, Chat Loop, and Steer upload
	 * accepted files first. Empty text never uploads. Enter on an empty
	 * Steer draft with no files resumes; selected files block that resume.
	 */
	submitTextarea(
		entry: HitlControlProjection,
		source: 'action' | 'enter',
	): void {
		if (entry.config.kind !== 'textarea' || this.uploading()) {
			return;
		}
		const draft = this.composerText(entry.nodeId, entry.portId);
		const pending = this.attachmentsFor(entry.nodeId, entry.portId);
		if (source === 'enter' && isSteerControlTextarea(entry)) {
			const entered = resolveComposerEnterPayload(entry, draft, {
				pendingAttachmentCount: pending.length,
			});
			if (draft.trim().length === 0) {
				if (entered.ok) {
					this.submitHitl([
						entry.nodeId,
						entry.portId,
						entered.payload,
					]);
				}
				return;
			}
		}
		const text = draft.trim();
		if (text.length === 0) {
			return;
		}
		if (!this.showsComposerAttachments(entry)) {
			this.submitHitl([entry.nodeId, entry.portId, text]);
			return;
		}
		void this.sendUserTurn(entry, text, pending);
	}

	setComposerText(nodeId: string, portId: string, value: string): void {
		if (this.isChatEntryNode(nodeId)) {
			this.updateNodeInput(nodeId, portId, value);
			return;
		}

		this.draftActions$.next({
			type: 'setDraft',
			key: `${nodeId}:${portId}`,
			value,
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
		const payload = wrapSteerHitlPayload(portId, event[2]);
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
		if (isComposerUserTurn(payload)) {
			this.draftActions$.next({
				type: 'setAttachments',
				key: `${nodeId}:${portId}`,
				files: [],
			});
		}
		this.hitlResolveLocal$.next(nodeId);
		if (isChatEntry) {
			this.draftActions$.next({ type: 'chatStartPending' });
			return;
		}
		this.draftActions$.next({
			type: 'clearPrefix',
			prefix: `${nodeId}:`,
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

	/** POST the pending files in order. Reports the first failure and sends nothing. */
	private async stageAttachments(
		pending: readonly File[],
	): Promise<readonly HitlUploadedFile[] | undefined> {
		this.uploading.set(true);
		this.uploadError.set(null);
		const staged = await stageComposerUploads(pending, (file) =>
			postSessionUpload({
				type: file.type,
				name: file.name,
				body: file,
			}),
		);
		this.uploading.set(false);
		if (!staged.ok) {
			this.uploadError.set(staged.message);
			return undefined;
		}
		return staged.files;
	}

	private async sendUserTurn(
		entry: HitlControlProjection,
		text: string,
		pending: readonly File[],
	): Promise<void> {
		const files = await this.stageAttachments(pending);
		if (files === undefined) {
			return;
		}
		const resolved = resolveComposerActionPayload(entry, text, { files });
		if (!resolved.ok) {
			return;
		}
		this.submitHitl([entry.nodeId, entry.portId, resolved.payload]);
	}

	/**
	 * `ask_user` reply. Attached files upload first and ride on the reply;
	 * the agent gets them on a following `role: user` message, as for `read`.
	 */
	submitAskUserReply(ask: RunnerAskUserAskPayload, text: string): void {
		const trimmed = text.trim();
		if (trimmed.length === 0 || this.uploading()) {
			return;
		}
		void this.sendAskUserReply(ask, trimmed);
	}

	private async sendAskUserReply(
		ask: RunnerAskUserAskPayload,
		text: string,
	): Promise<void> {
		const files = await this.stageAttachments(
			this.attachmentsFor(ask.nodeId, ASK_USER_COMPOSER_PORT_ID),
		);
		if (files === undefined) {
			return;
		}
		this.bridge.raw['runner.askUser.reply']?.next({
			runId: ask.runId,
			askId: ask.askId,
			text,
			...(files.length > 0 ? { files } : {}),
		});
		this.draftActions$.next({
			type: 'deleteKey',
			key: `${ask.nodeId}:${ASK_USER_COMPOSER_PORT_ID}`,
		});
	}
}
