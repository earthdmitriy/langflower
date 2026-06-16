import { describe, expect, it } from 'vitest';
import {
	createRuntimeHarness,
	type RuntimeHarness,
} from './testing/workflows/workflow-events.js';
import type { RuntimeEdge } from './types.js';
import {
	clusterHasChatEntry,
	collectClusterSlotKeys,
	detectGraphClusters,
	resolveClusterForNode,
} from './runtime-helpers.js';
import { createConstantTestNode } from './testing/nodes/constant-node.js';
import { createRouterTestNode } from './testing/nodes/router-node.js';
import {
	materializeBypassNodeOnAdd,
	materializeBypassSlot,
} from './bypass-ports.js';
import type { RuntimeNode } from './types.js';

const edge = (
	fromNodeId: string,
	toNodeId: string,
	edgeId: string,
): RuntimeEdge => ({
	edgeId: edgeId as RuntimeEdge['edgeId'],
	fromNodeId: fromNodeId as RuntimeEdge['fromNodeId'],
	fromPort: ['value', 0],
	toNodeId: toNodeId as RuntimeEdge['toNodeId'],
	toPort: ['value', 0],
});

describe('runtime-helpers — graph clusters', () => {
	it('detects edge-connected components and orphan singletons', () => {
		const edges = [edge('A', 'B', 'e1'), edge('C', 'D', 'e2')];

		const clusters = detectGraphClusters(['A', 'B', 'C', 'D', 'O'], edges);

		expect(clusters).toHaveLength(3);
		expect(clusters[0]?.nodeIds).toEqual(new Set(['A', 'B']));
		expect(clusters[0]?.edgeIds).toEqual(new Set(['e1']));
		expect(clusters[1]?.nodeIds).toEqual(new Set(['C', 'D']));
		expect(clusters[2]?.nodeIds).toEqual(new Set(['O']));
		expect(clusters[2]?.edgeIds.size).toBe(0);
	});

	it('resolves the cluster containing a node', () => {
		const edges = [edge('A', 'B', 'e1')];
		const clusters = detectGraphClusters(['A', 'B', 'O'], edges);

		expect(resolveClusterForNode(clusters, 'B').nodeIds).toEqual(
			new Set(['A', 'B']),
		);
		expect(resolveClusterForNode(clusters, 'O').nodeIds).toEqual(
			new Set(['O']),
		);
	});

	it('collects outputs for every node in a cluster', () => {
		const nodes = new Map([
			['A', createConstantTestNode({ nodeId: 'A', value: 'x' })],
			['O', createConstantTestNode({ nodeId: 'O', value: 'y' })],
		]);

		const keys = collectClusterSlotKeys(nodes, new Set(['A', 'O']));

		expect(keys.sort()).toEqual(['A.value@0', 'O.value@0']);
	});

	it('collects bypass slots once (no ch@1@0 double key)', () => {
		let router = materializeBypassNodeOnAdd(
			createRouterTestNode({ nodeId: 'R' }),
		);
		router = materializeBypassSlot(router, 'ch', 1);
		const sink = createConstantTestNode({ nodeId: 'S', value: 'y' });
		const keys = collectClusterSlotKeys(
			new Map([
				['R', router],
				['S', sink],
			]),
			new Set(['R', 'S']),
		);

		expect(keys.sort()).toEqual(['R.ch@0', 'R.ch@1', 'S.value@0']);
		expect(keys.some((k) => k.includes('ch@1@'))).toBe(false);
	});

	it('detects chat-entry clusters', () => {
		const clusters = detectGraphClusters(
			['chat', 'out'],
			[edge('chat', 'out', 'e1')],
		);
		const nodes = new Map<string, RuntimeNode>([
			[
				'chat',
				{
					...createConstantTestNode({ nodeId: 'chat', value: 'x' }),
					chatEntry: true,
				},
			],
			['out', createConstantTestNode({ nodeId: 'out', value: 'y' })],
		]);

		expect(
			clusterHasChatEntry(clusters[0]!, (id) => nodes.get(id) ?? false),
		).toBe(true);
	});
});
