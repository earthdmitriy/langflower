import { describe, expect, it } from 'vitest';
import {
	initialWorkflowTopbarState,
	workflowChangeControlTip,
	workflowTopbarWithCurrentSnapshot,
	workflowTopbarWithCurrentStatus,
} from '../types/workflow-topbar-projection';

describe('workflowTopbarWithCurrentSnapshot', () => {
	it('replaces active workflow and status atomically', () => {
		const dirty = workflowTopbarWithCurrentSnapshot(
			initialWorkflowTopbarState,
			{
				activeWorkflow: {
					workflowId: 'demo',
					metadata: {
						name: 'Demo',
						createdAt: '2026-06-17T00:00:00.000Z',
						updatedAt: '2026-06-17T00:00:00.000Z',
					},
					graph: {
						nodes: [],
						edges: [],
						viewport: { x: 0, y: 0, scale: 1 },
					},
				},
				currentStatus: { status: 'dirty' },
			},
		);

		expect(dirty.activeWorkflow?.workflowId).toBe('demo');
		expect(dirty.currentStatus).toBe('dirty');
	});
});

describe('workflowTopbarWithCurrentStatus', () => {
	it('updates dirty flag without replacing active workflow', () => {
		const withWorkflow = workflowTopbarWithCurrentSnapshot(
			initialWorkflowTopbarState,
			{
				activeWorkflow: {
					workflowId: 'demo',
					metadata: {
						name: 'Demo',
						createdAt: '2026-06-17T00:00:00.000Z',
						updatedAt: '2026-06-17T00:00:00.000Z',
					},
					graph: {
						nodes: [],
						edges: [],
						viewport: { x: 0, y: 0, scale: 1 },
					},
				},
				currentStatus: { status: 'pristine' },
			},
		);

		const dirty = workflowTopbarWithCurrentStatus(withWorkflow, 'dirty');

		expect(dirty.activeWorkflow?.workflowId).toBe('demo');
		expect(dirty.currentStatus).toBe('dirty');
	});
});

describe('workflowChangeControlTip', () => {
	it('replaces the idle tip while a run is active', () => {
		expect(workflowChangeControlTip(false, 'Rename workflow')).toBe(
			'Rename workflow',
		);
		expect(workflowChangeControlTip(true, 'Rename workflow')).toBe(
			'Stop the run to change workflows',
		);
	});
});
