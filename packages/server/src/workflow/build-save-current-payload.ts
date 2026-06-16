import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import type { LangflowerSession } from '../session/langflower-session.js';

export function buildSaveCurrentPayload(
	session: LangflowerSession,
): WorkflowSavePayload | null {
	const active = session.activeWorkflow;

	if (active === null) {
		return null;
	}

	return {
		workflowId: active.workflowId,
		metadata: {
			...active.metadata,
			updatedAt: new Date().toISOString(),
		},
		graph: active.graph,
		...(session.pendingPreviousId !== undefined
			? { previousWorkflowId: session.pendingPreviousId }
			: {}),
	};
}
