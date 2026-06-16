import type { WorkflowLoadFailedCode } from '@langflower/shared/langflower.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import {
	activateWorkflowInSession,
	type ActivateWorkflowResult,
} from './activate-workflow-in-session.js';
import type { ResolveNodeDefinition } from './workflow-document.js';
import type { WorkflowService } from './workflow.service.js';

export type LoadWorkflowResult =
	| {
			readonly ok: true;
			readonly repaired: boolean;
			readonly droppedNodeIds: readonly string[];
			readonly droppedEdgeIds: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly code: WorkflowLoadFailedCode;
			readonly message: string;
	  };

const uniqueIds = (ids: readonly string[]): readonly string[] => [
	...new Set(ids),
];

export const loadWorkflowIntoSession = async (
	session: LangflowerSession,
	workflowService: WorkflowService,
	projectDir: string,
	workflowId: string,
	resolveDefinition: ResolveNodeDefinition,
): Promise<LoadWorkflowResult> => {
	if (session.isGraphLocked()) {
		return {
			ok: false,
			code: 'GRAPH_LOCKED',
			message: 'Cannot load workflow while the graph is locked',
		};
	}

	const result = await workflowService.load({ workflowId });

	if (!result.ok) {
		const code: WorkflowLoadFailedCode =
			result.code === 'INVALID_GRAPH' ? 'INVALID_GRAPH' : 'NOT_FOUND';

		return {
			ok: false,
			code,
			message: result.message,
		};
	}

	const activated: ActivateWorkflowResult = activateWorkflowInSession(
		session,
		projectDir,
		result.document,
		{ dirty: result.repaired },
		resolveDefinition,
	);

	if (!activated.ok) {
		return activated;
	}

	const droppedNodeIds = uniqueIds([
		...result.droppedNodeIds,
		...activated.droppedNodeIds,
	]);
	const droppedEdgeIds = uniqueIds([
		...result.droppedEdgeIds,
		...activated.droppedEdgeIds,
	]);
	const repaired =
		result.repaired ||
		droppedNodeIds.length > 0 ||
		droppedEdgeIds.length > 0;

	return {
		ok: true,
		repaired,
		droppedNodeIds,
		droppedEdgeIds,
	};
};
