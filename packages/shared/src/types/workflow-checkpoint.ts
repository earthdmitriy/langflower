/**
 * Durable workflow-run checkpoint (ADR-018 D — explicit boundaries).
 *
 * Stored under `.langflower/runs/<workflowId>/<runId>/checkpoint.json`.
 * Only JSON-safe port values are persisted; unsupported values fail closed.
 * Writes fire only when an author-placed boundary is crossed
 * (`createCheckpoint` output meta / `common-checkpoint` node).
 */

export type WorkflowCheckpointJsonValue =
	| null
	| boolean
	| number
	| string
	| readonly WorkflowCheckpointJsonValue[]
	| { readonly [key: string]: WorkflowCheckpointJsonValue };

export type WorkflowCheckpointPortSnapshot = {
	readonly state: 'value';
	readonly value: WorkflowCheckpointJsonValue;
};

export type WorkflowCheckpointStatus =
	'running' | 'stopped' | 'completed' | 'failed';

export type WorkflowCheckpoint = {
	readonly schemaVersion: 1;
	readonly runId: string;
	readonly workflowId: string;
	readonly workflowFingerprint: string;
	readonly updatedAt: string;
	readonly status: WorkflowCheckpointStatus;
	readonly completedNodeIds: readonly string[];
	readonly outputSnapshots: Readonly<
		Record<string, Readonly<Record<string, WorkflowCheckpointPortSnapshot>>>
	>;
	/** Human-readable boundary label when the author provided one. */
	readonly label?: string;
};

export type WorkflowCheckpointSummary = {
	readonly runId: string;
	readonly workflowId: string;
	readonly status: WorkflowCheckpointStatus;
	readonly updatedAt: string;
	readonly completedNodeIds: readonly string[];
	/** Human-readable boundary label when present. */
	readonly label?: string;
	/**
	 * True when the checkpoint fingerprint does not match the active
	 * workflow topology — Continue is refused; Discard remains available.
	 */
	readonly stale?: boolean;
	/** Present when on-disk JSON failed validation — Continue is disabled. */
	readonly corrupt?: boolean;
};

export type RunnerCheckpointsSnapshotPayload = {
	readonly workflowId: string | null;
	readonly checkpoints: readonly WorkflowCheckpointSummary[];
};

export type RunnerResumeFailedCode =
	| 'CORRUPT'
	| 'STALE_WORKFLOW'
	| 'UNSUPPORTED_VALUE'
	| 'NOT_FOUND'
	| 'BUSY'
	| 'NO_WORKFLOW';

export type RunnerResumeFailedPayload = {
	readonly code: RunnerResumeFailedCode;
	readonly message: string;
	readonly runId?: string;
};

export type RunnerResumeRequestedPayload = {
	readonly runId: string;
};

export type RunnerCheckpointDiscardRequestedPayload = {
	readonly runId: string;
};
