import {
	getCommonReactiveNode,
	resolveWorkflowNodeDefinition,
} from '@langflower/common-nodes';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import { CustomNodeRegistry } from '../palette/custom-node-registry.js';
import { LangflowerSession } from './langflower-session.js';
import { buildSelectedNodePayload } from './build-selected-node-payload.js';

const packString = {
	...getCommonReactiveNode('common-string')!,
	type: 'pack-string',
	displayName: 'Pack String',
};

const workflowWithNode = (type: string): WorkflowLoadedPayload => ({
	workflowId: 'wf',
	metadata: {
		name: 'wf',
		createdAt: '2026-09-18T00:00:00.000Z',
		updatedAt: '2026-09-18T00:00:00.000Z',
	},
	graph: {
		viewport: { x: 0, y: 0, scale: 1 },
		nodes: [
			{
				id: 'n1',
				type,
				params: {},
				inputs: {},
				ui: { position: { x: 0, y: 0 } },
			},
		],
		edges: [],
	},
});

describe('buildSelectedNodePayload', () => {
	let session: LangflowerSession | undefined;

	afterEach(() => {
		session?.dispose();
		session = undefined;
	});

	it('stamps system for catalog types', () => {
		const registry = new CustomNodeRegistry();
		session = new LangflowerSession();
		session.selectedNodeId = 'n1';
		session.activeWorkflow = workflowWithNode('common-string');

		const payload = buildSelectedNodePayload(
			session,
			resolveWorkflowNodeDefinition,
			registry,
		);

		expect(payload.node?.definition.source).toBe('system');
	});

	it('stamps custom when the type is in the registry', () => {
		const registry = new CustomNodeRegistry();
		registry.setNodes([packString]);
		session = new LangflowerSession();
		session.selectedNodeId = 'n1';
		session.activeWorkflow = workflowWithNode('pack-string');

		const payload = buildSelectedNodePayload(
			session,
			(node) =>
				registry.get(node.type) ?? resolveWorkflowNodeDefinition(node),
			registry,
		);

		expect(payload.node?.definition.source).toBe('custom');
		expect(payload.node?.definition.type).toBe('pack-string');
	});
});
