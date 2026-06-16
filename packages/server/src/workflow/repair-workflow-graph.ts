import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import type {
	WorkflowNodePersisted,
	WorkflowPersistedGraph,
} from '@langflower/shared/langflower.js';
import type { ResolveNodeDefinition } from './workflow-document.js';

export type WorkflowGraphRepairResult = {
	readonly graph: WorkflowPersistedGraph;
	readonly droppedNodeIds: readonly string[];
	readonly droppedEdgeIds: readonly string[];
};

const definitionHasOutputPort = (
	definition: ReactiveNodeDefinition,
	portId: string,
): boolean => {
	if (Object.hasOwn(definition.bypassPorts, portId)) {
		return true;
	}

	return definition.outputsConfigs.some((config) => config.portId === portId);
};

const definitionHasInputPort = (
	definition: ReactiveNodeDefinition,
	portId: string,
): boolean => {
	if (Object.hasOwn(definition.bypassPorts, portId)) {
		return true;
	}

	return definition.inputsConfigs.some((config) => config.portId === portId);
};

/**
 * Strip unknown node types and edges that reference missing nodes or ports.
 * No rename / rewrite heuristics — keep only what the catalog can bind.
 */
export const repairWorkflowGraph = (
	graph: WorkflowPersistedGraph,
	resolveDefinition: ResolveNodeDefinition,
): WorkflowGraphRepairResult => {
	const droppedNodeIds: string[] = [];
	const keptNodes: WorkflowNodePersisted[] = [];
	const definitionByNodeId = new Map<string, ReactiveNodeDefinition>();

	for (const node of graph.nodes) {
		const definition = resolveDefinition(node);

		if (definition === undefined) {
			droppedNodeIds.push(node.id);
			continue;
		}

		keptNodes.push(node);
		definitionByNodeId.set(node.id, definition);
	}

	const keptNodeIds = new Set(keptNodes.map((node) => node.id));
	const droppedEdgeIds: string[] = [];
	const keptEdges = graph.edges.filter((edge) => {
		if (
			!keptNodeIds.has(edge.fromNodeId) ||
			!keptNodeIds.has(edge.toNodeId)
		) {
			droppedEdgeIds.push(edge.edgeId);
			return false;
		}

		const fromDefinition = definitionByNodeId.get(edge.fromNodeId);
		const toDefinition = definitionByNodeId.get(edge.toNodeId);

		if (fromDefinition === undefined || toDefinition === undefined) {
			droppedEdgeIds.push(edge.edgeId);
			return false;
		}

		const [fromPortId] = edge.fromPort;
		const [toPortId] = edge.toPort;

		if (
			!definitionHasOutputPort(fromDefinition, fromPortId) ||
			!definitionHasInputPort(toDefinition, toPortId)
		) {
			droppedEdgeIds.push(edge.edgeId);
			return false;
		}

		return true;
	});

	return {
		graph: {
			viewport: graph.viewport,
			nodes: keptNodes,
			edges: keptEdges,
		},
		droppedNodeIds,
		droppedEdgeIds,
	};
};
