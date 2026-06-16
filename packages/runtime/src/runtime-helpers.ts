import { bypassSlotKey } from './bypass-ports.js';
import { SlotKey, slotKey } from './port-meta.js';
import type { EdgeId, NodeId, RuntimeEdge, RuntimeNode } from './types.js';

/** Weakly connected subgraph — edges plus all nodes in the component (including unwired singletons). */
export type GraphCluster = {
	readonly nodeIds: ReadonlySet<NodeId>;
	readonly edgeIds: ReadonlySet<EdgeId>;
};

/**
 * Partition the graph into clusters for {@link Runtime} execution.
 *
 * - Edge-connected components (undirected) share one cluster.
 * - Nodes with no incident edges become singleton clusters (orphans).
 */
export function detectGraphClusters(
	nodeIds: Iterable<NodeId>,
	edges: readonly RuntimeEdge[],
): GraphCluster[] {
	const allNodeIds = [...nodeIds];
	const parent = new Map<NodeId, NodeId>();

	const find = (nodeId: NodeId): NodeId => {
		const parentId = parent.get(nodeId);

		if (parentId === undefined) {
			parent.set(nodeId, nodeId);
			return nodeId;
		}

		if (parentId === nodeId) {
			return nodeId;
		}

		const root = find(parentId);
		parent.set(nodeId, root);
		return root;
	};

	const union = (leftId: NodeId, rightId: NodeId): void => {
		const leftRoot = find(leftId);
		const rightRoot = find(rightId);

		if (leftRoot !== rightRoot) {
			parent.set(leftRoot, rightRoot);
		}
	};

	for (const nodeId of allNodeIds) {
		find(nodeId);
	}

	for (const edge of edges) {
		union(edge.fromNodeId, edge.toNodeId);
	}

	const clustersByRoot = new Map<
		NodeId,
		{ nodeIds: Set<NodeId>; edgeIds: Set<EdgeId> }
	>();

	for (const edge of edges) {
		const root = find(edge.fromNodeId);
		let cluster = clustersByRoot.get(root);

		if (cluster === undefined) {
			cluster = {
				nodeIds: new Set<NodeId>(),
				edgeIds: new Set<EdgeId>(),
			};
			clustersByRoot.set(root, cluster);
		}

		cluster.edgeIds.add(edge.edgeId);
		cluster.nodeIds.add(edge.fromNodeId);
		cluster.nodeIds.add(edge.toNodeId);
	}

	const clusteredNodes = new Set<NodeId>();

	for (const cluster of clustersByRoot.values()) {
		for (const nodeId of cluster.nodeIds) {
			clusteredNodes.add(nodeId);
		}
	}

	const clusters: GraphCluster[] = [...clustersByRoot.values()].map(
		(cluster) => ({
			nodeIds: cluster.nodeIds,
			edgeIds: cluster.edgeIds,
		}),
	);

	for (const nodeId of allNodeIds) {
		if (!clusteredNodes.has(nodeId)) {
			clusters.push({
				nodeIds: new Set([nodeId]),
				edgeIds: new Set<EdgeId>(),
			});
		}
	}

	return sortGraphClusters(clusters);
}

/** True when any node in the cluster is a chat-entry source. */
export const clusterHasChatEntry = (
	cluster: GraphCluster,
	getNode: (nodeId: NodeId) => RuntimeNode | false,
): boolean => {
	for (const nodeId of cluster.nodeIds) {
		const node = getNode(nodeId);
		if (node !== false && node.chatEntry === true) {
			return true;
		}
	}
	return false;
};

export function resolveClusterForNode(
	clusters: readonly GraphCluster[],
	nodeId: NodeId,
): GraphCluster {
	for (const cluster of clusters) {
		if (cluster.nodeIds.has(nodeId)) {
			return cluster;
		}
	}

	return {
		nodeIds: new Set([nodeId]),
		edgeIds: new Set<EdgeId>(),
	};
}

function sortGraphClusters(clusters: GraphCluster[]): GraphCluster[] {
	return [...clusters].sort((left, right) =>
		clusterSortKey(left).localeCompare(clusterSortKey(right)),
	);
}

function clusterSortKey(cluster: GraphCluster): string {
	return [...cluster.nodeIds].sort()[0] ?? '';
}

export function collectClusterSlotKeys(
	nodes: ReadonlyMap<NodeId, RuntimeNode>,
	clusterNodeIds: ReadonlySet<NodeId>,
): SlotKey[] {
	const keys: SlotKey[] = [];

	for (const nodeId of clusterNodeIds) {
		const node = nodes.get(nodeId);

		if (node === undefined) {
			continue;
		}

		// Regular outputs — skip bypass views (`ch` / `ch@1` on outputs map).
		// Bypass slots are keyed only from bypassConnections (base + slotIndex).
		for (const portId of Object.keys(node.outputs)) {
			const output = node.outputs[portId];
			if (output?.meta.mode === 'bypass') {
				continue;
			}
			keys.push(slotKey(nodeId, portId, 0));
		}

		// Bypass outputs (each slot is independent)
		if (node.bypassConnections !== undefined) {
			for (const [basePortId, connections] of Object.entries(
				node.bypassConnections,
			)) {
				for (
					let slotIndex = 0;
					slotIndex < connections.length;
					slotIndex++
				) {
					if (connections[slotIndex] !== undefined) {
						keys.push(bypassSlotKey(nodeId, basePortId, slotIndex));
					}
				}
			}
		}
	}

	return keys;
}

export function graphHasCycle(edges: readonly RuntimeEdge[]): boolean {
	const adjacency = new Map<NodeId, NodeId[]>();

	for (const edge of edges) {
		const next = adjacency.get(edge.fromNodeId) ?? [];
		next.push(edge.toNodeId);
		adjacency.set(edge.fromNodeId, next);
	}

	const visited = new Set<NodeId>();
	const stack = new Set<NodeId>();

	const visit = (nodeId: NodeId): boolean => {
		if (stack.has(nodeId)) {
			return true;
		}

		if (visited.has(nodeId)) {
			return false;
		}

		visited.add(nodeId);
		stack.add(nodeId);

		for (const nextId of adjacency.get(nodeId) ?? []) {
			if (visit(nextId)) {
				return true;
			}
		}

		stack.delete(nodeId);
		return false;
	};

	for (const nodeId of adjacency.keys()) {
		if (visit(nodeId)) {
			return true;
		}
	}

	return false;
}
