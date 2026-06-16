/**
 * Workflow persistence types for `workflowManagerConfig` WS routes.
 *
 * Intents are client → server; authoritative state arrives as **broadcast
 * snapshots** (`WorkflowListSnapshotPayload`, `WorkflowCurrentSnapshotPayload`)
 * so multiple tabs apply the same slices without RPC-style replies.
 *
 * **Identity (ADR-029):** `workflowId` is the `{stem}.json` filename stem.
 * It is never stored inside `metadata` or on disk — only on bridge/session
 * payloads and as the file name.
 */

import type { RuntimeEdge } from '@langflower/runtime';

/** Catalog row — no nodes/edges. Identity = filename stem. */
export type WorkflowListEntry = {
	readonly workflowId: string;
	readonly name: string;
	readonly description?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
};

/** User-facing fields stored beside the graph JSON (no identity). */
export type WorkflowMetadata = {
	readonly name: string;
	readonly description?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
};

/** Canvas layout and display-only node state. */
export type WorkflowNodeUiState = {
	readonly position: {
		readonly x: number;
		readonly y: number;
		readonly width?: number;
		readonly height?: number;
	};
	readonly label?: string;
};

/**
 * Persisted node — registry `type` + execution params/inputs + UI state.
 *
 * `params` — node definition config (constant value, delay ms, …).
 * `inputs` — **visible UI overrides only** (ADR-028): port has an editable
 * on-node/inspector field, and the value differs from the current definition
 * `defaultValue`. Hidden / wire-only / preview ports and default-equal values
 * are not stored; on load the server connects missing keys from the *current*
 * definition defaults.
 */
export type WorkflowNodePersisted = {
	readonly id: string;
	readonly type: string;
	readonly params: Readonly<Record<string, unknown>>;
	readonly inputs: Readonly<Record<string, unknown>>;
	readonly ui: WorkflowNodeUiState;
};

/** Shared canvas viewport — pan origin and zoom scale (flow space). */
export type CanvasViewport = {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
};

/** Full workflow graph body (nodes + edges only). */
export type WorkflowPersistedGraph = {
	readonly viewport: CanvasViewport;
	readonly nodes: readonly WorkflowNodePersisted[];
	readonly edges: readonly RuntimeEdge[];
};

/** Filesystem document shape — server builds this from the session on save. */
export type WorkflowSavePayload = {
	readonly workflowId: string;
	readonly metadata: WorkflowMetadata;
	readonly graph: WorkflowPersistedGraph;
	/** When renaming on save — previous file stem to remove. */
	readonly previousWorkflowId?: string;
};

/** Client intent — load one workflow by filename stem. */
export type WorkflowLoadPayload = {
	readonly workflowId: string;
};

/** Why `workflow.load.failed` rejected a load intent. */
export type WorkflowLoadFailedCode =
	| 'NOT_FOUND'
	| 'INVALID_GRAPH'
	| 'UNSUPPORTED_NODE'
	| 'INVALID_EDGE'
	| 'GRAPH_LOCKED'
	| 'BIND_FAILED';

/**
 * Load rejected — missing file, invalid graph, bind failure, or locked editor.
 * Unicast to the requester (see `runner.resume.failed`).
 */
export type WorkflowLoadFailedPayload = {
	readonly workflowId: string;
	readonly code: WorkflowLoadFailedCode;
	readonly message: string;
};

/**
 * Load succeeded after stripping unknown nodes / unbindable edges.
 * Unicast to the requester; document is dirty until Save.
 */
export type WorkflowLoadRepairedPayload = {
	readonly workflowId: string;
	readonly droppedNodeIds: readonly string[];
	readonly droppedEdgeIds: readonly string[];
	readonly message: string;
};

/** Client intent — delete one persisted workflow by filename stem. */
export type WorkflowDeletePayload = {
	readonly workflowId: string;
};

/** Command — serialize the server's in-memory active workflow to disk. */
export type WorkflowSaveCurrentPayload = Record<string, never>;

/**
 * Command — rename the active workflow (display name + filename stem).
 * Server persists metadata and renames `{workflowId}.json` immediately
 * (partial save); unsaved graph edits stay dirty in session.
 */
export type WorkflowRenameCurrentPayload = {
	readonly name: string;
};

/** Command — start an empty unsaved workflow in the session. */
export type WorkflowCreatePayload = Record<string, never>;

/** Command — persist a copy of a catalog workflow and open it. */
export type WorkflowCopyPayload = {
	readonly workflowId: string;
};

/** Server fact — dirty/pristine state of the session active workflow. */
export type WorkflowCurrentStatus = 'dirty' | 'pristine';

export type WorkflowCurrentStatusPayload = {
	readonly status: WorkflowCurrentStatus;
};

/**
 * Active workflow slice. `activeWorkflow` is `null` when none is loaded
 * (e.g. after deleting the active workflow).
 */
export type WorkflowCurrentSnapshotPayload = {
	readonly activeWorkflow: WorkflowLoadedPayload | null;
	readonly currentStatus: WorkflowCurrentStatusPayload;
};

/**
 * Loaded workflow document (filename stem + metadata + graph).
 * On disk: optional `$schema` plus `{ metadata, graph }`; `$schema` is preserved
 * on save when present and is not part of this runtime payload.
 */
export type WorkflowLoadedPayload = {
	readonly workflowId: string;
	readonly metadata: WorkflowMetadata;
	readonly graph: WorkflowPersistedGraph;
};

/** Catalog snapshot — metadata rows only, no graphs. */
export type WorkflowListSnapshotPayload = {
	readonly workflows: readonly WorkflowListEntry[];
};
