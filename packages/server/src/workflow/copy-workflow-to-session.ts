import type { LangflowerSession } from '../session/langflower-session.js';
import { activateWorkflowInSession } from './activate-workflow-in-session.js';
import { allocateWorkflowId } from './workflow-id.js';
import type { ResolveNodeDefinition } from './workflow-document.js';
import type { WorkflowService } from './workflow.service.js';

/**
 * Composer: load source → allocate id → save copy → activate in session.
 * Activate is a sibling step (not via loadWorkflowIntoSession reload).
 */
export const copyWorkflowToSession = async (
	session: LangflowerSession,
	workflowService: WorkflowService,
	projectDir: string,
	workflowId: string,
	resolveDefinition: ResolveNodeDefinition,
): Promise<boolean> => {
	if (session.isGraphLocked()) {
		return false;
	}

	const loaded = await workflowService.load({ workflowId });

	if (!loaded.ok) {
		return false;
	}

	const catalog = await workflowService.list();
	const nextWorkflowId = allocateWorkflowId(
		`${loaded.document.workflowId}-copy`,
		catalog.map((entry) => entry.workflowId),
	);
	const now = new Date().toISOString();

	const saveResult = await workflowService.save({
		workflowId: nextWorkflowId,
		metadata: {
			...loaded.document.metadata,
			name: `${loaded.document.metadata.name} copy`,
			createdAt: now,
			updatedAt: now,
		},
		graph: loaded.document.graph,
	});

	if (!saveResult.ok) {
		return false;
	}

	return activateWorkflowInSession(
		session,
		projectDir,
		saveResult.document,
		{ dirty: false },
		resolveDefinition,
	).ok;
};
