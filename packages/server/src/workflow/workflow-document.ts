import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import type {
	WorkflowLoadedPayload,
	WorkflowMetadata,
	WorkflowNodePersisted,
	WorkflowPersistedGraph,
} from '@langflower/shared/types/langflower-workflow.js';

/** On-disk shape — no `workflowId` (that is the filename stem). */
export type WorkflowDiskDocument = {
	readonly metadata: WorkflowMetadata;
	readonly graph: WorkflowPersistedGraph;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const parseMetadata = (raw: unknown): WorkflowMetadata => {
	if (!isRecord(raw)) {
		throw new Error('Workflow metadata must be an object');
	}

	const name = raw['name'];
	const createdAt = raw['createdAt'];
	const updatedAt = raw['updatedAt'];
	const description = raw['description'];

	if (typeof name !== 'string') {
		throw new Error('Workflow metadata.name must be a string');
	}

	if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') {
		throw new Error('Workflow metadata timestamps must be strings');
	}

	return {
		name,
		...(typeof description === 'string' ? { description } : {}),
		createdAt,
		updatedAt,
	};
};

/**
 * Parse on-disk JSON `{ metadata, graph }`. Legacy `metadata.id` is ignored.
 * Callers attach `workflowId` from the filename stem.
 */
export const parseWorkflowDocument = (
	raw: unknown,
):
	| { readonly ok: true; readonly document: WorkflowDiskDocument }
	| { readonly ok: false; readonly message: string } => {
	if (!isRecord(raw) || !isRecord(raw['graph'])) {
		return {
			ok: false,
			message: 'Workflow document must contain metadata and graph',
		};
	}

	try {
		return {
			ok: true,
			document: {
				metadata: parseMetadata(raw['metadata']),
				graph: raw['graph'] as WorkflowPersistedGraph,
			},
		};
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}
};

/**
 * Catalog lookup by persisted `type` + `params`. Common-nodes still keys
 * by `type`; callers pass `params` so instance-aware ports can consume
 * them without a server-side mapper.
 */
export type ResolveNodeDefinition = {
	(
		node: Pick<WorkflowNodePersisted, 'type' | 'params'>,
	): ReactiveNodeDefinition | undefined;
};

export const validateWorkflowStructure = (
	document: Pick<WorkflowLoadedPayload, 'graph'>,
	resolveDefinition: ResolveNodeDefinition,
): { readonly ok: true } | { readonly ok: false; readonly message: string } => {
	const nodeIds = new Set(document.graph.nodes.map((node) => node.id));

	for (const node of document.graph.nodes) {
		if (resolveDefinition(node) === undefined) {
			return {
				ok: false,
				message: `Unknown node type: ${node.type}`,
			};
		}
	}

	for (const edge of document.graph.edges) {
		if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
			return {
				ok: false,
				message: `Edge ${edge.edgeId} references missing node`,
			};
		}
	}

	return { ok: true };
};
