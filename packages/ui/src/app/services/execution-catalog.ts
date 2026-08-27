import {
	isSteerControlContinue,
	isSteerControlPause,
} from '@langflower/node-sdk/llm';
import type {
	PaletteConfigPayload,
	PaletteNodeDefinition,
	WorkflowCurrentSnapshotPayload,
} from '@langflower/shared/langflower';
import type { FeedRole } from '@langflower/node-sdk';
import { paletteByType as paletteNodesByType } from './bridge-diagram.service';

export const nodeTypeByIdFromWorkflow = (
	snap: WorkflowCurrentSnapshotPayload,
): ReadonlyMap<string, string> => {
	const next = new Map<string, string>();
	for (const node of snap.activeWorkflow?.graph.nodes ?? []) {
		next.set(node.id, node.type);
	}
	return next;
};

export const nodeLabelsFromWorkflow = (
	snap: WorkflowCurrentSnapshotPayload,
	palette: ReadonlyMap<string, PaletteNodeDefinition>,
): ReadonlyMap<string, string> => {
	const next = new Map<string, string>();
	for (const node of snap.activeWorkflow?.graph.nodes ?? []) {
		const title =
			node.ui.label?.trim() ||
			palette.get(node.type)?.displayName ||
			node.type;
		next.set(node.id, title);
	}
	return next;
};

export type FeedCatalog = {
	readonly labels: ReadonlyMap<string, string>;
	readonly paletteByType: ReadonlyMap<string, PaletteNodeDefinition>;
	readonly nodeTypeById: ReadonlyMap<string, string>;
	readonly workflowId?: string | null;
};

export const feedCatalogFromSnaps = (
	workflow: WorkflowCurrentSnapshotPayload,
	palette: PaletteConfigPayload,
): FeedCatalog => {
	const paletteByType = paletteNodesByType(palette.nodes);
	const nodeTypeById = nodeTypeByIdFromWorkflow(workflow);
	return {
		labels: nodeLabelsFromWorkflow(workflow, paletteByType),
		paletteByType,
		nodeTypeById,
		workflowId: workflow.activeWorkflow?.workflowId ?? null,
	};
};

/** True when the catalog belongs to a different workflow document (not rename). */
export const catalogSwitchedDocument = (
	previous: FeedCatalog | null,
	next: FeedCatalog,
): boolean => {
	if (previous === null) {
		return false;
	}
	const previousId = previous.workflowId ?? null;
	const nextId = next.workflowId ?? null;
	if (previousId === null || nextId === null || previousId === nextId) {
		return false;
	}
	const previousIds = [...previous.nodeTypeById.keys()].sort().join('\0');
	const nextIds = [...next.nodeTypeById.keys()].sort().join('\0');
	return previousIds !== nextIds;
};

export const definitionForNode = (
	paletteByType: ReadonlyMap<string, PaletteNodeDefinition>,
	nodeTypeById: ReadonlyMap<string, string>,
	nodeId: string,
): PaletteNodeDefinition | undefined => {
	const type = nodeTypeById.get(nodeId);
	return type === undefined ? undefined : paletteByType.get(type);
};

const FEED_ROLES = new Set<FeedRole>([
	'none',
	'reasoning',
	'progress',
	'draft',
	'tool',
	'shell',
	'result',
	'recovery',
]);

export const resolveOutputFeedRole = (
	paletteByType: ReadonlyMap<string, PaletteNodeDefinition>,
	nodeTypeById: ReadonlyMap<string, string>,
	nodeId: string,
	portId: string,
): FeedRole | undefined => {
	const def = definitionForNode(paletteByType, nodeTypeById, nodeId);
	const meta = def?.outputsConfigs.find((output) => output.portId === portId);
	const role = meta?.feed?.role;
	return typeof role === 'string' && FEED_ROLES.has(role as FeedRole)
		? (role as FeedRole)
		: undefined;
};

/** User-bubble copy for a HITL submit / input-received payload. */
export const formatHitlUserText = (
	definition: PaletteNodeDefinition,
	portId: string,
	payload: unknown,
): string => {
	if (isSteerControlPause(payload)) {
		return '';
	}
	if (isSteerControlContinue(payload)) {
		return payload.kind === 'steer' ? payload.text.trim() : '';
	}
	const input = definition.inputsConfigs.find(
		(entry) => entry.portId === portId,
	);
	const hitl = input?.hitl;
	if (hitl === undefined) {
		return typeof payload === 'string' ? payload.trim() : '';
	}
	if (hitl.kind === 'button') {
		return hitl.label.trim();
	}
	if (typeof payload === 'string') {
		return payload.trim();
	}
	if (payload === null || payload === undefined) {
		return '';
	}
	return String(payload);
};
