import { describe, expect, it } from 'vitest';
import type { EdgeId, NodeId } from '@langflower/runtime';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import type { WorkflowPersistedGraph } from '@langflower/shared/langflower';
import {
	chatEntryNodeIdsInGraph,
	graphHasPlainStartTargets,
	nodeClusterRequiresChatEntry,
	partitionWorkflowClusters,
} from '../chat-entry-clusters.js';

const palette = new Map<string, PaletteNodeDefinition>([
	[
		'common-chat-input',
		{ type: 'common-chat-input', chatEntry: true } as PaletteNodeDefinition,
	],
	[
		'common-string',
		{ type: 'common-string', chatEntry: false } as PaletteNodeDefinition,
	],
	[
		'common-preview',
		{ type: 'common-preview', chatEntry: false } as PaletteNodeDefinition,
	],
]);

const node = (
	id: string,
	type: string,
): WorkflowPersistedGraph['nodes'][number] => ({
	id,
	type,
	params: {},
	inputs: {},
	ui: { position: { x: 0, y: 0 } },
});

const edge = (
	edgeId: string,
	fromNodeId: string,
	fromPort: string,
	toNodeId: string,
	toPort: string,
): WorkflowPersistedGraph['edges'][number] => ({
	edgeId: edgeId as EdgeId,
	fromNodeId: fromNodeId as NodeId,
	fromPort: [fromPort, 0],
	toNodeId: toNodeId as NodeId,
	toPort: [toPort, 0],
});

const graph = (
	nodes: WorkflowPersistedGraph['nodes'],
	edges: WorkflowPersistedGraph['edges'],
): WorkflowPersistedGraph => ({
	viewport: { x: 0, y: 0, scale: 1 },
	nodes,
	edges,
});

describe('chat-entry-clusters', () => {
	it('partitions undirected clusters', () => {
		const g = graph(
			[
				node('a', 'common-string'),
				node('b', 'common-preview'),
				node('c', 'common-chat-input'),
			],
			[edge('e1', 'a', 'value', 'b', 'text')],
		);

		const clusters = partitionWorkflowClusters(g);
		expect(clusters).toHaveLength(2);
		expect(chatEntryNodeIdsInGraph(g, palette)).toEqual(['c']);
		expect(graphHasPlainStartTargets(g, palette)).toBe(true);
		expect(nodeClusterRequiresChatEntry(g, palette, 'c')).toBe(true);
		expect(nodeClusterRequiresChatEntry(g, palette, 'a')).toBe(false);
	});

	it('treats a chat→preview graph as composer-only', () => {
		const g = graph(
			[node('chat', 'common-chat-input'), node('out', 'common-preview')],
			[edge('e1', 'chat', 'message', 'out', 'text')],
		);

		expect(graphHasPlainStartTargets(g, palette)).toBe(false);
		expect(nodeClusterRequiresChatEntry(g, palette, 'out')).toBe(true);
	});
});
