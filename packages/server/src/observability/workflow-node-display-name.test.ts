import { describe, expect, it } from 'vitest';
import type { WorkflowLoadedPayload } from '@langflower/shared/langflower.js';
import { workflowNodeDisplayName } from './workflow-node-display-name.js';

const NODE_ID = 'n-7f3a9c2e';

const workflowWith = (
	label: string | undefined,
	type = 'common-coder',
): WorkflowLoadedPayload => ({
	workflowId: 'wf',
	metadata: {
		name: 'wf',
		createdAt: '2026-09-16T00:00:00.000Z',
		updatedAt: '2026-09-16T00:00:00.000Z',
	},
	graph: {
		viewport: { x: 0, y: 0, scale: 1 },
		nodes: [
			{
				id: NODE_ID,
				type,
				params: {},
				inputs: {},
				ui: {
					position: { x: 0, y: 0 },
					...(label !== undefined ? { label } : {}),
				},
			},
		],
		edges: [],
	},
});

const registryCoder = (): string | undefined => 'Coder';

describe('workflowNodeDisplayName', () => {
	it('prefers a non-empty canvas ui.label', () => {
		expect(
			workflowNodeDisplayName(
				workflowWith('My coder'),
				NODE_ID,
				registryCoder,
			),
		).toBe('My coder');
	});

	it('uses palette displayName when the canvas label is empty', () => {
		expect(
			workflowNodeDisplayName(workflowWith('  '), NODE_ID, registryCoder),
		).toBe('Coder');
		expect(
			workflowNodeDisplayName(
				workflowWith(undefined),
				NODE_ID,
				registryCoder,
			),
		).toBe('Coder');
	});

	it('falls back to registry type, then the raw id', () => {
		const unresolved = (): undefined => undefined;
		expect(
			workflowNodeDisplayName(
				workflowWith(undefined, 'common-coder'),
				NODE_ID,
				unresolved,
			),
		).toBe('common-coder');
		expect(workflowNodeDisplayName(null, NODE_ID, unresolved)).toBe(
			NODE_ID,
		);
	});
});
