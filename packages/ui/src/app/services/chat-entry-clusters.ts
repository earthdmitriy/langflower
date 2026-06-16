import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import type { WorkflowPersistedGraph } from '@langflower/shared/langflower';

/**
 * Undirected weakly-connected components on a persisted workflow graph —
 * mirrors runtime `detectGraphClusters` for UI run / composer gating.
 */
export const partitionWorkflowClusters = (
	graph: WorkflowPersistedGraph,
): readonly (readonly string[])[] => {
	const parent = new Map<string, string>();

	const find = (id: string): string => {
		const current = parent.get(id);
		if (current === undefined) {
			parent.set(id, id);
			return id;
		}
		if (current === id) {
			return id;
		}
		const root = find(current);
		parent.set(id, root);
		return root;
	};

	const union = (left: string, right: string): void => {
		const leftRoot = find(left);
		const rightRoot = find(right);
		if (leftRoot !== rightRoot) {
			parent.set(leftRoot, rightRoot);
		}
	};

	for (const node of graph.nodes) {
		find(node.id);
	}
	for (const edge of graph.edges) {
		union(edge.fromNodeId, edge.toNodeId);
	}

	const byRoot = new Map<string, string[]>();
	for (const node of graph.nodes) {
		const root = find(node.id);
		const group = byRoot.get(root);
		if (group === undefined) {
			byRoot.set(root, [node.id]);
		} else {
			group.push(node.id);
		}
	}

	return [...byRoot.values()];
};

/** Node ids that are chat-entry sources (palette `chatEntry`). */
export const chatEntryNodeIdsInGraph = (
	graph: WorkflowPersistedGraph,
	paletteByType: ReadonlyMap<string, PaletteNodeDefinition>,
): readonly string[] =>
	graph.nodes
		.filter((node) => paletteByType.get(node.type)?.chatEntry === true)
		.map((node) => node.id);

/** True when plain Run has at least one non-chat-entry cluster to start. */
export const graphHasPlainStartTargets = (
	graph: WorkflowPersistedGraph,
	paletteByType: ReadonlyMap<string, PaletteNodeDefinition>,
): boolean => {
	const chatIds = new Set(chatEntryNodeIdsInGraph(graph, paletteByType));
	if (chatIds.size === 0) {
		return graph.nodes.length > 0;
	}

	return partitionWorkflowClusters(graph).some((cluster) =>
		cluster.every((nodeId) => !chatIds.has(nodeId)),
	);
};

/** True when the node's weakly connected cluster contains a chat-entry node. */
export const nodeClusterRequiresChatEntry = (
	graph: WorkflowPersistedGraph,
	paletteByType: ReadonlyMap<string, PaletteNodeDefinition>,
	nodeId: string,
): boolean => {
	const chatIds = new Set(chatEntryNodeIdsInGraph(graph, paletteByType));
	if (chatIds.size === 0) {
		return false;
	}

	const cluster = partitionWorkflowClusters(graph).find((group) =>
		group.includes(nodeId),
	);
	if (cluster === undefined) {
		return false;
	}
	return cluster.some((id) => chatIds.has(id));
};
