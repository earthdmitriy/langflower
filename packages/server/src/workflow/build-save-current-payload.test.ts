import type { WorkflowLoadedPayload } from '@langflower/shared/langflower.js';
import { describe, expect, it } from 'vitest';
import { LangflowerSession } from '../session/langflower-session.js';
import { buildSaveCurrentPayload } from './build-save-current-payload.js';

function createSession(
	document: WorkflowLoadedPayload | null,
): LangflowerSession {
	const session = new LangflowerSession();
	session.activeWorkflow = document;
	session.activeWorkflowId = document?.workflowId;
	return session;
}

describe('buildSaveCurrentPayload', () => {
	it('returns null when no active workflow', () => {
		expect(buildSaveCurrentPayload(createSession(null))).toBeNull();
	});

	it('builds payload from in-memory active workflow', () => {
		const document: WorkflowLoadedPayload = {
			workflowId: 'demo',
			metadata: {
				name: 'Demo',
				createdAt: '2026-06-17T00:00:00.000Z',
				updatedAt: '2026-06-17T00:00:00.000Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		};

		const payload = buildSaveCurrentPayload(createSession(document));

		expect(payload?.workflowId).toBe('demo');
		expect(payload?.graph).toEqual(document.graph);
		expect(payload?.previousWorkflowId).toBeUndefined();
	});

	it('includes pendingPreviousId after rename', () => {
		const session = createSession({
			workflowId: 'new-name',
			metadata: {
				name: 'New Name',
				createdAt: '2026-06-17T00:00:00.000Z',
				updatedAt: '2026-06-17T00:00:00.000Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		});
		session.pendingPreviousId = 'old-name';

		const payload = buildSaveCurrentPayload(session);

		expect(payload?.previousWorkflowId).toBe('old-name');
	});
});
