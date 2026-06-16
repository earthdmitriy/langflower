import type { NodeId } from '@langflower/runtime';
import type { LangflowerConfigScope } from './langflower-config.js';
import type { PaletteNodeDefinition } from './langflower-palette.js';
import type { WorkflowNodePersisted } from './langflower-workflow.js';

/** Palette drop or explicit add-node intent — server assigns `nodeId`. */
export type EditorAddNodeRequestedPayload = {
	readonly type: string;
	readonly position: {
		readonly x: number;
		readonly y: number;
		readonly width?: number;
		readonly height?: number;
	};
	readonly params?: Readonly<Record<string, unknown>>;
	readonly inputs?: Readonly<Record<string, unknown>>;
	readonly label?: string;
};

/** Serializable connect intent — server assigns `edgeId`. */
export type EditorAddEdgeRequestedPayload = {
	readonly fromNodeId: NodeId;
	readonly fromPort: readonly [string, number];
	readonly toNodeId: NodeId;
	readonly toPort: readonly [string, number];
};

/**
 * Batch paste intent — client temp ids remap to server-assigned node ids.
 * `clientId` is never persisted.
 */
export type EditorPasteRequestedPayload = {
	readonly nodes: readonly {
		readonly clientId: string;
		readonly type: string;
		readonly position: {
			readonly x: number;
			readonly y: number;
			readonly width?: number;
			readonly height?: number;
		};
		readonly params?: Readonly<Record<string, unknown>>;
		readonly inputs?: Readonly<Record<string, unknown>>;
		readonly label?: string;
	}[];
	readonly edges: readonly {
		readonly fromClientId: string;
		readonly fromPort: readonly [string, number];
		readonly toClientId: string;
		readonly toPort: readonly [string, number];
	}[];
};

/** Committed update for one existing node — at least one patch field required. */
export type EditorUpdateNodeRequestedPayload = {
	readonly nodeId: NodeId;
	readonly position?: {
		readonly x: number;
		readonly y: number;
	};
	readonly ui?: {
		readonly width?: number;
		readonly height?: number;
		readonly label?: string;
	};
	readonly params?: Readonly<Record<string, unknown>>;
	readonly inputs?: Readonly<Record<string, unknown>>;
};

/** Cross-tab canvas selection intent — `null` clears selection. */
export type EditorSelectNodeRequestedPayload = {
	readonly nodeId: NodeId | null;
};

/**
 * Authoritative Settings aside chrome — open/closed + active config scope.
 * Session memory only (not persisted to `langflower.jsonc`).
 */
export type EditorSettingsSnapshotPayload = {
	readonly open: boolean;
	readonly scope: LangflowerConfigScope;
};

/**
 * Intent to set Settings aside chrome.
 *
 * When `open: true`, `scope` is required. When `open: false`, server keeps the
 * prior scope for the next open.
 */
export type EditorSettingsRequestedPayload = {
	readonly open: boolean;
	readonly scope?: LangflowerConfigScope;
};

/**
 * Rich selected-node projection for the Inspector — the existing persisted
 * node shape plus its palette definition, no parallel DTO. `null` when
 * nothing is selected (or the previously selected node no longer exists).
 */
export type EditorSelectedNodePayload = {
	readonly node:
		| (WorkflowNodePersisted & {
				readonly definition: PaletteNodeDefinition;
		  })
		| null;
};
