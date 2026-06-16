import type { WorkflowLoadedPayload } from '@langflower/shared/langflower.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { activateWorkflowInSession } from './activate-workflow-in-session.js';
import { allocateWorkflowId } from './workflow-id.js';
import type { ResolveNodeDefinition } from './workflow-document.js';
import type { WorkflowService } from './workflow.service.js';

const EMPTY_VIEWPORT = {
	x: 0,
	y: 0,
	scale: 1,
} as const;

export const createEmptyWorkflowInSession = async (
	session: LangflowerSession,
	workflowService: WorkflowService,
	projectDir: string,
	resolveDefinition: ResolveNodeDefinition,
): Promise<boolean> => {
	if (session.isGraphLocked()) {
		return false;
	}

	const catalog = await workflowService.list();
	const workflowId = allocateWorkflowId(
		'untitled',
		catalog.map((entry) => entry.workflowId),
	);
	const now = new Date().toISOString();

	const document: WorkflowLoadedPayload = {
		workflowId,
		metadata: {
			name: 'Untitled',
			createdAt: now,
			updatedAt: now,
		},
		graph: {
			viewport: EMPTY_VIEWPORT,
			nodes: [],
			edges: [],
		},
	};

	const activated = activateWorkflowInSession(
		session,
		projectDir,
		document,
		{ dirty: true },
		resolveDefinition,
	);

	if (!activated.ok) {
		return false;
	}

	session.pendingPreviousId = undefined;

	return true;
};
