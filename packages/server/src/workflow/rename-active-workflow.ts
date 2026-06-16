import type { WorkflowLoadedPayload } from '@langflower/shared/langflower.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { slugifyWorkflowId } from './workflow-id.js';
import type { WorkflowService } from './workflow.service.js';

export type RenameActiveWorkflowResult = {
	readonly document: WorkflowLoadedPayload;
	readonly catalogChanged: boolean;
};

/**
 * Partial-save rename: updates session identity immediately; when a file for
 * the previous stem exists, rewrites `{nextId}.json` with on-disk graph (not
 * the dirty in-memory graph) and removes the old file. Dirty/pristine is
 * preserved.
 */
export const renameActiveWorkflow = async (
	session: LangflowerSession,
	workflowService: WorkflowService,
	name: string,
): Promise<RenameActiveWorkflowResult | null> => {
	const active = session.activeWorkflow;

	if (active === null) {
		return null;
	}

	const trimmed = name.trim();

	if (trimmed.length === 0 || trimmed === active.metadata.name) {
		return null;
	}

	const nextWorkflowId = slugifyWorkflowId(trimmed);
	const previousWorkflowId = active.workflowId;

	if (
		nextWorkflowId !== previousWorkflowId &&
		(await workflowService.exists(nextWorkflowId))
	) {
		return null;
	}

	const previousStatus = session.currentStatus;
	const diskLoad = await workflowService.load({
		workflowId: previousWorkflowId,
	});
	let catalogChanged = false;

	if (diskLoad.ok) {
		const now = new Date().toISOString();
		const saveResult = await workflowService.save({
			workflowId: nextWorkflowId,
			metadata: {
				...diskLoad.document.metadata,
				name: trimmed,
				updatedAt: now,
			},
			graph: diskLoad.document.graph,
			...(nextWorkflowId !== previousWorkflowId
				? { previousWorkflowId }
				: {}),
		});

		if (!saveResult.ok) {
			return null;
		}

		catalogChanged = true;
	}

	const nextDocument: WorkflowLoadedPayload = {
		workflowId: nextWorkflowId,
		metadata: {
			...active.metadata,
			name: trimmed,
		},
		graph: active.graph,
	};

	session.activeWorkflow = nextDocument;
	session.activeWorkflowId = nextWorkflowId;
	session.pendingPreviousId = undefined;
	session.currentStatus = previousStatus;

	return { document: nextDocument, catalogChanged };
};
