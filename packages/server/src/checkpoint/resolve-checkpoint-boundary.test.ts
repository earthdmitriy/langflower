import {
	getCommonReactiveNode,
	resolveWorkflowNodeDefinition,
} from '@langflower/common-nodes';
import { describe, expect, it } from 'vitest';
import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import type { ResolveNodeDefinition } from '../workflow/workflow-document.js';
import { resolveCheckpointBoundary } from './resolve-checkpoint-boundary.js';

const resolveSystem: ResolveNodeDefinition = resolveWorkflowNodeDefinition;

const packCheckpoint = {
	...getCommonReactiveNode('common-checkpoint')!,
	type: 'pack-checkpoint',
};

const resolveWithPack: ResolveNodeDefinition = (node) => {
	if (node.type === 'pack-checkpoint') {
		return packCheckpoint;
	}

	return resolveSystem(node);
};

const workflowWithCheckpoint = (
	inputs: Readonly<Record<string, unknown>>,
	uiLabel?: string,
	type = 'common-checkpoint',
): WorkflowLoadedPayload =>
	({
		workflowId: 'wf',
		metadata: {
			name: 'wf',
			createdAt: '2026-07-19T00:00:00.000Z',
			updatedAt: '2026-07-19T00:00:00.000Z',
		},
		graph: {
			viewport: { x: 0, y: 0, scale: 1, width: 800, height: 600 },
			nodes: [
				{
					id: 'checkpoint-a',
					type,
					params: {},
					inputs,
					ui: {
						position: { x: 0, y: 0 },
						...(uiLabel !== undefined ? { label: uiLabel } : {}),
					},
				},
			],
			edges: [],
		},
	}) as WorkflowLoadedPayload;

describe('resolveCheckpointBoundary', () => {
	it('detects common-checkpoint value output', () => {
		const boundary = resolveCheckpointBoundary(
			workflowWithCheckpoint({ label: 'After A' }),
			'checkpoint-a',
			'value',
			resolveSystem,
		);

		expect(boundary).toEqual({
			createCheckpoint: true,
			label: 'After A',
		});
	});

	it('falls back to canvas ui.label when inputs.label is empty', () => {
		const boundary = resolveCheckpointBoundary(
			workflowWithCheckpoint({}, 'Canvas Checkpoint'),
			'checkpoint-a',
			'value',
			resolveSystem,
		);

		expect(boundary).toEqual({
			createCheckpoint: true,
			label: 'Canvas Checkpoint',
		});
	});

	it('returns undefined for non-boundary ports', () => {
		expect(
			resolveCheckpointBoundary(
				workflowWithCheckpoint({}),
				'checkpoint-a',
				'label',
				resolveSystem,
			),
		).toBeUndefined();
	});

	it('detects createCheckpoint on a custom pack type', () => {
		const boundary = resolveCheckpointBoundary(
			workflowWithCheckpoint(
				{ label: 'Pack' },
				undefined,
				'pack-checkpoint',
			),
			'checkpoint-a',
			'value',
			resolveWithPack,
		);

		expect(boundary).toEqual({
			createCheckpoint: true,
			label: 'Pack',
		});
	});

	it('skips custom checkpoint types without the bind resolver', () => {
		expect(
			resolveCheckpointBoundary(
				workflowWithCheckpoint(
					{ label: 'Pack' },
					undefined,
					'pack-checkpoint',
				),
				'checkpoint-a',
				'value',
				resolveSystem,
			),
		).toBeUndefined();
	});
});
