import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import { describe, expect, it } from 'vitest';
import type { ResolveNodeDefinition } from './workflow-document.js';
import { repairWorkflowGraph } from './repair-workflow-graph.js';

const resolveDefinition: ResolveNodeDefinition = (node) =>
	resolveWorkflowNodeDefinition({ type: node.type });

describe('repairWorkflowGraph', () => {
	it('drops unknown node types and incident edges', () => {
		const result = repairWorkflowGraph(
			{
				viewport: { x: 0, y: 0, scale: 1 },
				nodes: [
					{
						id: 'chat',
						type: 'common-chat-input',
						params: {},
						inputs: {},
						ui: { position: { x: 0, y: 0 } },
					},
					{
						id: 'helper',
						type: 'common-openai-llm',
						params: {},
						inputs: {},
						ui: { position: { x: 100, y: 0 } },
					},
					{
						id: 'clarify',
						type: 'common-hitl',
						params: {},
						inputs: {},
						ui: { position: { x: 200, y: 0 } },
					},
				],
				edges: [
					{
						edgeId: 'e-chat-helper',
						fromNodeId: 'chat',
						fromPort: ['message', 0],
						toNodeId: 'helper',
						toPort: ['userPrompt', 0],
					},
					{
						edgeId: 'e-helper-clarify',
						fromNodeId: 'helper',
						fromPort: ['response', 0],
						toNodeId: 'clarify',
						toPort: ['trigger', 0],
					},
				],
			},
			resolveDefinition,
		);

		expect(result.droppedNodeIds).toEqual(['clarify']);
		expect(result.droppedEdgeIds).toEqual(['e-helper-clarify']);
		expect(result.graph.nodes.map((node) => node.id)).toEqual([
			'chat',
			'helper',
		]);
		expect(result.graph.edges.map((edge) => edge.edgeId)).toEqual([
			'e-chat-helper',
		]);
	});

	it('drops edges with unknown ports on known nodes', () => {
		const result = repairWorkflowGraph(
			{
				viewport: { x: 0, y: 0, scale: 1 },
				nodes: [
					{
						id: 'merge',
						type: 'common-merge',
						params: {},
						inputs: {},
						ui: { position: { x: 0, y: 0 } },
					},
					{
						id: 'llm',
						type: 'common-openai-llm',
						params: {},
						inputs: {},
						ui: { position: { x: 100, y: 0 } },
					},
				],
				edges: [
					{
						edgeId: 'e-bad-merge-in',
						fromNodeId: 'llm',
						fromPort: ['response', 0],
						toNodeId: 'merge',
						toPort: ['step', 0],
					},
					{
						edgeId: 'e-bad-merge-out',
						fromNodeId: 'merge',
						fromPort: ['output', 0],
						toNodeId: 'llm',
						toPort: ['feedback', 0],
					},
					{
						edgeId: 'e-ok',
						fromNodeId: 'llm',
						fromPort: ['response', 0],
						toNodeId: 'merge',
						toPort: ['value', 0],
					},
				],
			},
			resolveDefinition,
		);

		expect(result.droppedNodeIds).toEqual([]);
		expect(result.droppedEdgeIds).toEqual([
			'e-bad-merge-in',
			'e-bad-merge-out',
		]);
		expect(result.graph.edges.map((edge) => edge.edgeId)).toEqual(['e-ok']);
	});

	it('keeps router bypass port edges', () => {
		const result = repairWorkflowGraph(
			{
				viewport: { x: 0, y: 0, scale: 1 },
				nodes: [
					{
						id: 'router',
						type: 'common-router',
						params: {},
						inputs: {},
						ui: { position: { x: 0, y: 0 } },
					},
					{
						id: 'preview',
						type: 'common-preview',
						params: {},
						inputs: {},
						ui: { position: { x: 100, y: 0 } },
					},
				],
				edges: [
					{
						edgeId: 'e-router-preview',
						fromNodeId: 'router',
						fromPort: ['ch', 0],
						toNodeId: 'preview',
						toPort: ['text', 0],
					},
				],
			},
			resolveDefinition,
		);

		expect(result.droppedNodeIds).toEqual([]);
		expect(result.droppedEdgeIds).toEqual([]);
		expect(result.graph.edges).toHaveLength(1);
	});

	it('keeps a valid soft-hard chat loop intact', () => {
		const result = repairWorkflowGraph(
			{
				viewport: { x: 0, y: 0, scale: 1 },
				nodes: [
					{
						id: 'chat',
						type: 'common-chat-input',
						params: {},
						inputs: {},
						ui: { position: { x: 0, y: 0 } },
					},
					{
						id: 'helper',
						type: 'common-openai-llm',
						params: {},
						inputs: {},
						ui: { position: { x: 100, y: 0 } },
					},
					{
						id: 'review',
						type: 'common-hitl-review-gate',
						params: {},
						inputs: {},
						ui: { position: { x: 200, y: 0 } },
					},
				],
				edges: [
					{
						edgeId: 'e-chat-helper',
						fromNodeId: 'chat',
						fromPort: ['message', 0],
						toNodeId: 'helper',
						toPort: ['userPrompt', 0],
					},
					{
						edgeId: 'e-helper-review',
						fromNodeId: 'helper',
						fromPort: ['response', 0],
						toNodeId: 'review',
						toPort: ['result', 0],
					},
					{
						edgeId: 'e-review-feedback',
						fromNodeId: 'review',
						fromPort: ['feedback', 0],
						toNodeId: 'helper',
						toPort: ['feedback', 0],
					},
				],
			},
			resolveDefinition,
		);

		expect(result.droppedNodeIds).toEqual([]);
		expect(result.droppedEdgeIds).toEqual([]);
		expect(result.graph.nodes).toHaveLength(3);
		expect(result.graph.edges).toHaveLength(3);
	});
});
