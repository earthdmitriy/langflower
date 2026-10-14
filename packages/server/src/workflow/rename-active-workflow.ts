import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import type { WorkflowSessionFile } from '@langflower/shared/types/workflow-session.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import type { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';
import { slugifyWorkflowId } from './workflow-id.js';
import type { WorkflowService } from './workflow.service.js';

export type RenameActiveWorkflowResult = {
	readonly document: WorkflowLoadedPayload;
	readonly catalogChanged: boolean;
};

const rewriteSessionWorkflowIds = async (
	workflowSessions: WorkflowSessionStore,
	directoryWorkflowId: string,
	nextWorkflowId: string,
): Promise<
	{ readonly ok: true } | { readonly ok: false; readonly message: string }
> => {
	const listed = await workflowSessions.list(directoryWorkflowId, {
		allowIdentityMismatch: true,
	});

	if (!listed.ok) {
		return { ok: false, message: listed.message };
	}

	for (const summary of listed.value) {
		if (summary.corrupt === true) {
			continue;
		}

		const loaded = await workflowSessions.read(
			directoryWorkflowId,
			summary.sessionId,
			{ allowIdentityMismatch: true },
		);

		if (!loaded.ok) {
			if (loaded.code === 'CORRUPT') {
				continue;
			}

			return { ok: false, message: loaded.message };
		}

		const next: WorkflowSessionFile = {
			...loaded.value,
			sessionId: summary.sessionId,
			workflowId: nextWorkflowId,
			workflowSnapshot: {
				...loaded.value.workflowSnapshot,
				workflowId: nextWorkflowId,
			},
		};
		const written = await workflowSessions.write(next);

		if (!written.ok) {
			return { ok: false, message: written.message };
		}
	}

	return { ok: true };
};

const rollbackMovedSessions = async (
	workflowSessions: WorkflowSessionStore,
	fromWorkflowId: string,
	toWorkflowId: string,
): Promise<void> => {
	// Move the directory back before rewriting ids. `write` stores a file
	// under the workflowId inside the JSON, so the directory has to be the
	// old stem first.
	await workflowSessions.moveAll(fromWorkflowId, toWorkflowId);
	await rewriteSessionWorkflowIds(
		workflowSessions,
		toWorkflowId,
		toWorkflowId,
	);
};

/**
 * Partial-save rename: updates session identity immediately; when a file for
 * the previous stem exists, rewrites `{nextId}.json` with on-disk graph (not
 * the dirty in-memory graph) and removes the old file. Dirty/pristine is
 * preserved.
 *
 * Sessions move with the workflow id: directory rename, rewrite
 * `workflowId` in each file, then the workflow file. A failed workflow
 * rename moves the directory back.
 */
export const renameActiveWorkflow = async (
	session: LangflowerSession,
	workflowService: WorkflowService,
	name: string,
	workflowSessions: WorkflowSessionStore,
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

	// 1. Move `.langflower/sessions/<old>/` when the file stem changes.
	let sessionsMoved = false;

	if (nextWorkflowId !== previousWorkflowId) {
		const moved = await workflowSessions.moveAll(
			previousWorkflowId,
			nextWorkflowId,
		);

		if (!moved.ok) {
			return null;
		}

		sessionsMoved = moved.value;
	}

	// 2. Rewrite `workflowId` inside each moved session file.
	if (sessionsMoved) {
		const rewritten = await rewriteSessionWorkflowIds(
			workflowSessions,
			nextWorkflowId,
			nextWorkflowId,
		);

		if (!rewritten.ok) {
			await rollbackMovedSessions(
				workflowSessions,
				nextWorkflowId,
				previousWorkflowId,
			);
			return null;
		}
	}

	// 3. Rename the workflow file from the on-disk graph.
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
			if (sessionsMoved) {
				await rollbackMovedSessions(
					workflowSessions,
					nextWorkflowId,
					previousWorkflowId,
				);
			}

			return null;
		}

		catalogChanged = true;
		session.savedWorkflowDocument = saveResult.document;
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
