import type { EdgeId, NodeId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import type {
	WorkflowLoadedPayload,
	WorkflowNodePersisted,
	WorkflowPersistedGraph,
} from '../types/langflower-workflow.js';
import { isSameWorkflowDocument } from './is-same-workflow-document.js';

const persistedNode = (
	id: string,
	overrides?: {
		readonly param?: string;
		readonly input?: string;
		readonly x?: number;
		readonly type?: string;
	},
): WorkflowNodePersisted => ({
	id,
	type: overrides?.type ?? 'common-string',
	params: { text: overrides?.param ?? 'hello' },
	inputs: { value: overrides?.input ?? 'seed' },
	ui: { position: { x: overrides?.x ?? 10, y: 20 } },
});

const persistedEdge = (
	edgeId: string,
	toPort: string,
): WorkflowPersistedGraph['edges'][number] => ({
	edgeId: edgeId as EdgeId,
	fromNodeId: 'n1' as NodeId,
	fromPort: ['value', 0],
	toNodeId: 'n2' as NodeId,
	toPort: [toPort, 0],
});

const document = (
	graph?: Partial<
		Pick<WorkflowPersistedGraph, 'viewport' | 'nodes' | 'edges'>
	>,
): WorkflowLoadedPayload => ({
	workflowId: 'wf',
	metadata: {
		name: 'Demo',
		createdAt: '2026-10-14T00:00:00.000Z',
		updatedAt: '2026-10-14T00:00:00.000Z',
	},
	graph: {
		viewport: graph?.viewport ?? { x: 0, y: 0, scale: 1 },
		nodes: graph?.nodes ?? [persistedNode('n1'), persistedNode('n2')],
		edges: graph?.edges ?? [persistedEdge('e1', 'value')],
	},
});

describe('isSameWorkflowDocument', () => {
	it('treats two identical documents as equal', () => {
		expect(isSameWorkflowDocument(document(), document())).toBe(true);
	});

	it('ignores viewport pan and zoom', () => {
		expect(
			isSameWorkflowDocument(
				document(),
				document({ viewport: { x: 40, y: -8, scale: 1.5 } }),
			),
		).toBe(true);
	});

	it('detects a param, input, position, node, or edge change', () => {
		const base = document();

		expect(
			isSameWorkflowDocument(
				base,
				document({
					nodes: [
						persistedNode('n1', { param: 'other' }),
						persistedNode('n2'),
					],
				}),
			),
		).toBe(false);

		expect(
			isSameWorkflowDocument(
				base,
				document({
					nodes: [
						persistedNode('n1', { input: 'other' }),
						persistedNode('n2'),
					],
				}),
			),
		).toBe(false);

		expect(
			isSameWorkflowDocument(
				base,
				document({
					nodes: [
						persistedNode('n1', { x: 99 }),
						persistedNode('n2'),
					],
				}),
			),
		).toBe(false);

		expect(
			isSameWorkflowDocument(
				base,
				document({
					nodes: [
						persistedNode('n1', { type: 'common-delay' }),
						persistedNode('n2'),
					],
				}),
			),
		).toBe(false);

		expect(
			isSameWorkflowDocument(
				base,
				document({ edges: [persistedEdge('e1', 'delay')] }),
			),
		).toBe(false);
	});

	it('treats node order and edge order as significant', () => {
		expect(
			isSameWorkflowDocument(
				document(),
				document({
					nodes: [persistedNode('n2'), persistedNode('n1')],
				}),
			),
		).toBe(false);

		const first = persistedEdge('e1', 'value');
		const second = persistedEdge('e2', 'delay');

		expect(
			isSameWorkflowDocument(
				document({ edges: [first, second] }),
				document({ edges: [second, first] }),
			),
		).toBe(false);
	});
});
