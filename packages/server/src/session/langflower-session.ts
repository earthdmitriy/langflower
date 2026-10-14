import type { NodeStateJson } from '@langflower/node-sdk';
import type { RunId, RuntimeRunnerStatus } from '@langflower/runtime';
import { RuntimeFacade } from '@langflower/runtime';
import type {
	DividerPositions,
	ExecutionFeedSnapshotPayload,
} from '@langflower/shared/types/langflower-bootstrap.js';
import type { EditorSettingsSnapshotPayload } from '@langflower/shared/types/langflower-editor.js';
import type {
	WorkflowCurrentStatus,
	WorkflowLoadedPayload,
} from '@langflower/shared/types/langflower-workflow.js';
import { deriveExecutionProgressStatus } from '@langflower/shared/execution/derive-run-settle-outcome.js';
import { Subscription } from 'rxjs';
import { PendingAskUserAsks } from '../harness/pending-ask-user-asks.js';
import { PendingPermissionAsks } from '../harness/pending-permission-asks.js';
import {
	emptySettingsDraftStore,
	type SettingsDraftStore,
} from './settings-draft-session.js';

const SESSION_READY_VERSION = 1;
const SNAPSHOT_VERSION = 7;

export type WorkflowSessionBinding =
	| { readonly kind: 'workflow' }
	| { readonly kind: 'workflowSession'; readonly sessionId: string };

export class LangflowerSession {
	readonly runtime = new RuntimeFacade({ log: true });
	/** Feed permission.ask pause/resume for the internal tool loop. */
	readonly permissionAsks = new PendingPermissionAsks();
	/** Feed ask_user pause/resume for the internal tool loop. */
	readonly askUserAsks = new PendingAskUserAsks();

	activeWorkflow: WorkflowLoadedPayload | null = null;
	activeWorkflowId: string | undefined;
	/**
	 * `{ kind: 'workflow' }` shows the workflow file.
	 * While `workflowSession` is bound, `activeWorkflow` is that session's
	 * snapshot document.
	 */
	binding: WorkflowSessionBinding = { kind: 'workflow' };
	/**
	 * Workflow file loaded from disk. Session tabs compare it with each
	 * session graph. Refreshed after a successful workflow-file write.
	 */
	savedWorkflowDocument: WorkflowLoadedPayload | null = null;
	/** Head node state for the bound workflow session. */
	headNodeStates: Readonly<Record<string, NodeStateJson>> = {};
	/**
	 * Feed to publish while a session is bound and no run is active.
	 * `undefined` uses the live runner log. `null` clears the feed.
	 */
	boundFeedSnapshot: ExecutionFeedSnapshotPayload | null | undefined =
		undefined;
	/** Events of the current run already appended to the feed log. */
	feedPersistedEvents = 0;
	/** Byte offset of the current run marker. */
	feedRunOffset = 0;
	/** Byte length of the feed log after the last append. */
	feedBytes = 0;
	/** Run id of the marker already written for the open run. */
	feedMarkerRunId: string | undefined;
	/** JSON of `nodeStates` last written to the session record. */
	persistedNodeStatesJson = '{}';
	currentStatus: WorkflowCurrentStatus = 'pristine';
	pendingPreviousId: string | undefined;
	runnerStatus: RuntimeRunnerStatus = 'idle';
	runId: RunId | undefined;
	dividerPositions: DividerPositions = {
		leftWidth: 280,
		rightWidth: 360,
		composerHeight: 168,
	};
	/** Left node palette shown. Hydrated from project jsonc; default visible. */
	paletteVisible = true;
	/** In-memory canvas selection, shared across tabs. `null` = nothing selected. */
	selectedNodeId: string | null = null;
	/** Settings aside chrome — session memory only (not persisted to disk). */
	settings: EditorSettingsSnapshotPayload = {
		open: false,
		scope: 'project',
	};
	/** Unsaved Settings form draft per scope (session memory). */
	settingsDraft: SettingsDraftStore = emptySettingsDraftStore();

	private readonly subscriptions = new Subscription();
	private mcpDispose: (() => Promise<void>) | undefined;
	private workflowSessionAutosave: { markDirty(): void } | undefined;

	constructor() {
		this.subscriptions.add(
			this.runtime.runner.status$.subscribe((status) => {
				if (status !== 'running') {
					this.permissionAsks.denyAll(
						this.runId !== undefined
							? String(this.runId)
							: undefined,
					);
					this.askUserAsks.failAll(
						this.runId !== undefined
							? String(this.runId)
							: undefined,
					);
					void this.releaseMcpRuntime();
				}

				this.runnerStatus = status;
			}),
		);
	}

	/** Replace the run-scoped MCP dispose hook (closes previous if any). */
	setMcpDispose(dispose: (() => Promise<void>) | undefined): void {
		void this.releaseMcpRuntime();
		this.mcpDispose = dispose;
	}

	private async releaseMcpRuntime(): Promise<void> {
		const dispose = this.mcpDispose;
		this.mcpDispose = undefined;

		if (dispose !== undefined) {
			await dispose();
		}
	}

	dispose(): void {
		this.permissionAsks.denyAll();
		this.askUserAsks.failAll();
		void this.releaseMcpRuntime();
		// Dispose runner before dropping status$ so late emissions settle
		// cleanly; then unsubscribe (subjects are already completed).
		this.runtime.runner.dispose();
		this.subscriptions.unsubscribe();
		this.runtime.editor.dispose();
	}

	isGraphLocked(): boolean {
		return this.runnerStatus === 'running';
	}

	/**
	 * Bound sessions debounce into the session file and stay pristine.
	 * Unbound sessions keep the workflow dirty flag.
	 */
	attachWorkflowSessionAutosave(
		autosave: { markDirty(): void } | undefined,
	): void {
		this.workflowSessionAutosave = autosave;
	}

	markDirty(): void {
		if (this.binding.kind === 'workflowSession') {
			this.workflowSessionAutosave?.markDirty();
			return;
		}

		this.currentStatus = 'dirty';
	}

	markPristine(): void {
		this.currentStatus = 'pristine';
		this.pendingPreviousId = undefined;
	}

	buildExecutionFeed(): ExecutionFeedSnapshotPayload | null {
		if (
			this.binding.kind === 'workflowSession' &&
			this.runnerStatus !== 'running' &&
			this.boundFeedSnapshot !== undefined
		) {
			return this.boundFeedSnapshot;
		}

		if (this.runId === undefined || this.activeWorkflowId === undefined) {
			return null;
		}

		const events = [...this.runtime.runner.eventLog];
		return {
			runId: this.runId,
			workflowId: this.activeWorkflowId,
			status: deriveExecutionProgressStatus(this.runnerStatus, events),
			events,
		};
	}

	static readonly sessionReadyVersion = SESSION_READY_VERSION;
	static readonly snapshotVersion = SNAPSHOT_VERSION;
}
