import type { RunId, RuntimeRunnerStatus } from '@langflower/runtime';
import { RuntimeFacade } from '@langflower/runtime';
import type {
	DividerPositions,
	EditorSettingsSnapshotPayload,
	ExecutionFeedSnapshotPayload,
	WorkflowCurrentStatus,
	WorkflowLoadedPayload,
} from '@langflower/shared/langflower.js';
import { deriveExecutionProgressStatus } from '@langflower/shared/langflower.js';
import { Subscription } from 'rxjs';
import { PendingPermissionAsks } from '../harness/pending-permission-asks.js';
import {
	emptySettingsDraftStore,
	type SettingsDraftStore,
} from './settings-draft-session.js';

const SESSION_READY_VERSION = 1;
const SNAPSHOT_VERSION = 6;

export class LangflowerSession {
	readonly runtime = new RuntimeFacade({ log: true });
	/** Feed permission.ask pause/resume for the internal tool loop. */
	readonly permissionAsks = new PendingPermissionAsks();

	activeWorkflow: WorkflowLoadedPayload | null = null;
	activeWorkflowId: string | undefined;
	currentStatus: WorkflowCurrentStatus = 'pristine';
	pendingPreviousId: string | undefined;
	runnerStatus: RuntimeRunnerStatus = 'idle';
	runId: RunId | undefined;
	dividerPositions: DividerPositions = {
		leftWidth: 280,
		rightWidth: 360,
		composerHeight: 168,
	};
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

	constructor() {
		this.subscriptions.add(
			this.runtime.runner.status$.subscribe((status) => {
				if (status !== 'running') {
					this.permissionAsks.denyAll(
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

	markDirty(): void {
		this.currentStatus = 'dirty';
	}

	markPristine(): void {
		this.currentStatus = 'pristine';
		this.pendingPreviousId = undefined;
	}

	buildExecutionFeed(): ExecutionFeedSnapshotPayload | null {
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
