/**
 * Persisted workflow session (epic 49). One record per session under
 * `.langflower/sessions/<workflowId>/<label>.json`, named like the tab
 * (`2026-10-14 #1`). The latest-run feed is
 * `<label>.feed.jsonl`. `sessionId` stays the UUID inside the file.
 *
 * Checkpoints are points inside the session. There is no `status` on a
 * point — several runs share one session, so a stored status cannot stay
 * correct. `stale` is computed when listing points, not written to disk.
 */

import type { NodeStateJson } from '@langflower/node-sdk';
import type { WorkflowLoadedPayload } from './langflower-workflow.js';

/** JSON-safe value captured on one output port at a session point. */
export type WorkflowSessionPortSnapshot = {
	readonly state: 'value';
	readonly value: NodeStateJson;
};

/**
 * Port snapshots captured at a session point (`nodeId` → `portId` → value).
 */
export type WorkflowSessionOutputSnapshots = Readonly<
	Record<string, Readonly<Record<string, WorkflowSessionPortSnapshot>>>
>;

/**
 * Immutable boundary inside a session. Written once when an author-placed
 * checkpoint boundary is crossed; later runs do not rewrite it.
 */
export type WorkflowSessionPoint = {
	readonly pointId: string;
	readonly runId: string;
	/** Boundary label from `resolveCheckpointBoundary`, when set. */
	readonly label?: string;
	readonly createdAt: string;
	readonly workflowFingerprint: string;
	readonly completedNodeIds: readonly string[];
	readonly outputSnapshots: WorkflowSessionOutputSnapshots;
	/** Node state at the boundary (`nodeId` → JSON). */
	readonly nodeStates: Readonly<Record<string, NodeStateJson>>;
	/** Byte offset of this run's marker in `<label>.feed.jsonl`. */
	readonly runOffset: number;
	/** Byte offset where this point's feed slice ends. */
	readonly feedOffset: number;
	/**
	 * `<nodeId>.<portId>` when a non-JSON output was seen before the
	 * boundary. Continue stays disabled.
	 */
	readonly unsupported?: string;
};

/**
 * Session file (`schemaVersion` 1). The filename stem is `label`.
 * `sessionId` is the server UUID stored in the file.
 */
export type WorkflowSessionFile = {
	readonly schemaVersion: 1;
	readonly sessionId: string;
	readonly workflowId: string;
	readonly label: string;
	/** Server-local calendar day, `YYYY-MM-DD`, for the tab ordinal. */
	readonly localDay: string;
	readonly ordinal: number;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly workflowSnapshot: WorkflowLoadedPayload;
	/** Head node state (`nodeId` → JSON). */
	readonly nodeStates: Readonly<Record<string, NodeStateJson>>;
	/**
	 * When set, the latest run's feed is read only up to this byte.
	 * `null` reads through the end of the feed file.
	 */
	readonly headOffset: number | null;
	readonly points: readonly WorkflowSessionPoint[];
};

/** Catalog row for `workflowSession.list.snapshot`. */
export type WorkflowSessionSummary = {
	readonly sessionId: string;
	readonly label: string;
	/** Creation time. The tab strip sorts by this, not by the last flush. */
	readonly createdAt?: string;
	readonly updatedAt: string;
	/** On-disk JSON failed validation. Listed, not selectable, deletable. */
	readonly corrupt?: true;
	/**
	 * The session file’s graph is not the saved workflow.
	 * Viewport is ignored. The open tab may still differ in memory
	 * before that file is flushed.
	 */
	readonly differsFromWorkflow?: true;
};

/**
 * Point row for `workflowSession.current.snapshot`.
 * `stale` is computed at list time from the fingerprint; it is not stored.
 */
export type WorkflowSessionPointSummary = {
	readonly pointId: string;
	readonly label?: string;
	readonly createdAt: string;
	readonly stale?: true;
	readonly unsupported?: string;
};

export type WorkflowSessionActionFailedCode =
	| 'RUN_ACTIVE'
	| 'DIRTY_WORKFLOW'
	| 'SESSION_BOUND'
	| 'NOT_FOUND'
	| 'CORRUPT'
	| 'WRITE_FAILED';

/** Refusal fact for a `workflowSession.*` intent. Not a success reply. */
export type WorkflowSessionActionFailedPayload = {
	readonly code: WorkflowSessionActionFailedCode;
	readonly message: string;
};

export type WorkflowSessionListSnapshotPayload = {
	readonly workflowId: string;
	readonly sessions: readonly WorkflowSessionSummary[];
};

export type WorkflowSessionCurrentSnapshotPayload = {
	readonly workflowId: string;
	/** `null` when the workflow file is showing (no session bound). */
	readonly sessionId: string | null;
	readonly differsFromWorkflow: boolean;
	readonly points: readonly WorkflowSessionPointSummary[];
};

/**
 * Create a session from the open workflow. An empty object is enough;
 * the server uses the open workflow.
 */
export type WorkflowSessionCreateRequestedPayload = {
	readonly workflowId?: string;
};

/**
 * Bind `sessionId`, or leave the session when `sessionId` is null.
 */
export type WorkflowSessionSelectRequestedPayload = {
	readonly sessionId: string | null;
};

/**
 * Session-scoped intent body for delete, replace-snapshot, and
 * write-snapshot. The server refuses it when `sessionId` is not active.
 */
export type WorkflowSessionScopedRequestedPayload = {
	readonly sessionId: string;
};

export type WorkflowSessionDiscardPointRequestedPayload = {
	readonly sessionId: string;
	readonly pointId: string;
};

/** Continue from a session point (`runner.resume.requested`). */
export type WorkflowSessionResumeRequestedPayload = {
	readonly pointId: string;
};

/**
 * Resume refusal codes for a session point (`runner.resume.failed`).
 */
export type WorkflowSessionResumeFailedCode =
	| 'CORRUPT'
	| 'UNSUPPORTED_VALUE'
	| 'POINT_STALE'
	| 'NOT_FOUND'
	| 'BUSY'
	| 'NO_SESSION';

export type WorkflowSessionResumeFailedPayload = {
	readonly code: WorkflowSessionResumeFailedCode;
	readonly message: string;
	readonly pointId?: string;
};
