import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import type {
	WorkflowSessionActionFailedCode,
	WorkflowSessionFile,
} from '@langflower/shared/types/workflow-session.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { resetSessionExecutionFeed } from '../session/reset-session-execution-feed.js';
import {
	activateWorkflowInSession,
	type ActivateWorkflowResult,
} from '../workflow/activate-workflow-in-session.js';
import { buildSaveCurrentPayload } from '../workflow/build-save-current-payload.js';
import { loadWorkflowIntoSession } from '../workflow/load-workflow-into-session.js';
import type { ResolveNodeDefinition } from '../workflow/workflow-document.js';
import type { WorkflowService } from '../workflow/workflow.service.js';
import type { WorkflowSessionAutosave } from './workflow-session-autosave.js';
import {
	isSafeWorkflowSessionId,
	type WorkflowSessionStore,
} from './workflow-session-store.js';

export type WorkflowSessionActionDeps = {
	readonly session: LangflowerSession;
	readonly store: WorkflowSessionStore;
	readonly workflowService: WorkflowService;
	readonly resolveDefinition: ResolveNodeDefinition;
	readonly autosave: WorkflowSessionAutosave;
	readonly now?: () => Date;
};

export type WorkflowSessionActionResult =
	| {
			readonly ok: true;
			readonly canvasChanged: boolean;
			readonly feedChanged: boolean;
	  }
	| {
			readonly ok: false;
			readonly code: WorkflowSessionActionFailedCode;
			readonly message: string;
	  };

const failed = (
	code: WorkflowSessionActionFailedCode,
	message: string,
): WorkflowSessionActionResult => ({ ok: false, code, message });

const succeeded = (
	canvasChanged: boolean,
	feedChanged: boolean,
): WorkflowSessionActionResult => ({
	ok: true,
	canvasChanged,
	feedChanged,
});

const clock = (deps: WorkflowSessionActionDeps): Date =>
	deps.now !== undefined ? deps.now() : new Date();

const serverLocalDay = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

/**
 * HITL pause keeps the runner `'running'`. `'stopped'` is after Stop
 * and may switch sessions.
 */
const refuseRunActive = (
	session: LangflowerSession,
): WorkflowSessionActionResult | undefined => {
	if (session.runnerStatus !== 'running') {
		return undefined;
	}

	return failed(
		'RUN_ACTIVE',
		'Cannot change workflow sessions while a run is active',
	);
};

const refuseStaleSession = (
	session: LangflowerSession,
	sessionId: string,
): WorkflowSessionActionResult | undefined => {
	if (
		session.binding.kind === 'workflowSession' &&
		session.binding.sessionId === sessionId
	) {
		return undefined;
	}

	return failed('NOT_FOUND', 'Workflow session is not the active session');
};

const activeWorkflowId = (session: LangflowerSession): string | undefined =>
	session.activeWorkflow?.workflowId ?? session.activeWorkflowId;

const mapStoreCode = (code: string): WorkflowSessionActionFailedCode => {
	switch (code) {
		case 'NOT_FOUND':
		case 'CORRUPT':
		case 'WRITE_FAILED':
			return code;
		default:
			return 'WRITE_FAILED';
	}
};

/**
 * Bind a loaded session file. `activeWorkflow` becomes the snapshot.
 * `currentStatus` stays pristine.
 */
const bindLoadedSession = async (
	deps: WorkflowSessionActionDeps,
	file: WorkflowSessionFile,
	savedDocument: WorkflowLoadedPayload | null,
	resetFeed: boolean,
): Promise<WorkflowSessionActionResult> => {
	const { session } = deps;
	const previousBinding = session.binding;
	const previousSaved = session.savedWorkflowDocument;
	const previousHead = session.headNodeStates;
	const previousFeed = session.boundFeedSnapshot;

	// 1. Bind before materialize so a dropped-node markDirty autosaves.
	session.binding = {
		kind: 'workflowSession',
		sessionId: file.sessionId,
	};
	session.savedWorkflowDocument = savedDocument;
	session.headNodeStates = { ...file.nodeStates };

	// 2. Rematerialize the editor the same way a workflow load does.
	const activated: ActivateWorkflowResult = activateWorkflowInSession(
		session,
		file.workflowSnapshot,
		{ dirty: false },
		deps.resolveDefinition,
	);

	if (!activated.ok) {
		session.binding = previousBinding;
		session.savedWorkflowDocument = previousSaved;
		session.headNodeStates = previousHead;
		session.boundFeedSnapshot = previousFeed;
		return failed('CORRUPT', activated.message);
	}

	// 3. Publish the stored feed. Do not keep the previous run log.
	if (resetFeed) {
		const head = await deps.store.readFeedHead(
			file.workflowId,
			file.sessionId,
		);
		const snapshot = head.ok ? head.value.snapshot : null;
		session.boundFeedSnapshot = snapshot;
		session.feedRunOffset = head.ok ? head.value.runOffset : 0;
		session.feedBytes = head.ok ? head.value.size : 0;
		session.feedPersistedEvents = snapshot?.events.length ?? 0;
		session.feedMarkerRunId = snapshot?.runId;
		session.persistedNodeStatesJson = JSON.stringify(file.nodeStates);
		if (session.runnerStatus !== 'running') {
			resetSessionExecutionFeed(session);
		}
	}

	session.currentStatus = 'pristine';
	return succeeded(true, resetFeed);
};

const rememberSavedWorkflow = async (
	deps: WorkflowSessionActionDeps,
	workflowId: string,
): Promise<WorkflowLoadedPayload | null> => {
	const loaded = await deps.workflowService.load({ workflowId });

	if (!loaded.ok) {
		return null;
	}

	return loaded.document;
};

/**
 * Create a session from the saved workflow file and bind it.
 * Refuses a dirty workflow and a running graph.
 */
export const createWorkflowSession = async (
	deps: WorkflowSessionActionDeps,
): Promise<WorkflowSessionActionResult> => {
	const { session, store } = deps;

	// 1. Refuse an active run.
	const active = refuseRunActive(session);

	if (active !== undefined) {
		return active;
	}

	// 2. Refuse unsaved workflow edits.
	if (session.currentStatus === 'dirty') {
		return failed(
			'DIRTY_WORKFLOW',
			'Save or discard workflow edits before creating a session',
		);
	}

	const workflowId = activeWorkflowId(session);

	if (workflowId === undefined || session.activeWorkflow === null) {
		return failed('NOT_FOUND', 'No workflow is open');
	}

	// 3. Copy the saved file, not the in-memory graph.
	const loaded = await deps.workflowService.load({ workflowId });

	if (!loaded.ok) {
		return failed('NOT_FOUND', loaded.message);
	}

	// 4. Allocate the tab label and write the file under one directory lock.
	return store.exclusiveDirectory(workflowId, async () => {
		const now = clock(deps);
		const localDay = serverLocalDay(now);
		const ordinal = await store.nextOrdinal(workflowId, localDay);

		if (!ordinal.ok) {
			return failed(mapStoreCode(ordinal.code), ordinal.message);
		}

		if (session.binding.kind === 'workflowSession') {
			const flushed = await deps.autosave.flush();

			if (!flushed.ok) {
				return flushed;
			}
		}

		const sessionId = crypto.randomUUID();
		const timestamp = now.toISOString();
		const file: WorkflowSessionFile = {
			schemaVersion: 1,
			sessionId,
			workflowId,
			label: `${localDay} #${ordinal.value}`,
			localDay,
			ordinal: ordinal.value,
			createdAt: timestamp,
			updatedAt: timestamp,
			workflowSnapshot: loaded.document,
			nodeStates: {},
			headOffset: null,
			points: [],
		};
		const written = await store.write(file);

		if (!written.ok) {
			return failed(mapStoreCode(written.code), written.message);
		}

		return bindLoadedSession(deps, file, loaded.document, true);
	});
};

/**
 * Bind a session for a Run that has no tab yet.
 * The snapshot is the graph on screen. The editor is not rematerialized
 * and the workflow file is not written.
 */
export const ensureSessionForRun = async (
	deps: WorkflowSessionActionDeps,
): Promise<WorkflowSessionActionResult> => {
	const { session, store } = deps;

	if (session.binding.kind === 'workflowSession') {
		return succeeded(false, false);
	}

	const active = refuseRunActive(session);

	if (active !== undefined) {
		return active;
	}

	const workflow = session.activeWorkflow;

	if (workflow === null) {
		return failed('NOT_FOUND', 'No workflow is open');
	}

	return store.exclusiveDirectory(workflow.workflowId, async () => {
		if (session.binding.kind === 'workflowSession') {
			return succeeded(false, false);
		}

		const now = clock(deps);
		const localDay = serverLocalDay(now);
		const ordinal = await store.nextOrdinal(workflow.workflowId, localDay);

		if (!ordinal.ok) {
			return failed(mapStoreCode(ordinal.code), ordinal.message);
		}

		const sessionId = crypto.randomUUID();
		const timestamp = now.toISOString();
		const file: WorkflowSessionFile = {
			schemaVersion: 1,
			sessionId,
			workflowId: workflow.workflowId,
			label: `${localDay} #${ordinal.value}`,
			localDay,
			ordinal: ordinal.value,
			createdAt: timestamp,
			updatedAt: timestamp,
			workflowSnapshot: structuredClone(workflow),
			nodeStates: {},
			headOffset: null,
			points: [],
		};
		const written = await store.write(file);

		if (!written.ok) {
			return failed(mapStoreCode(written.code), written.message);
		}

		session.binding = { kind: 'workflowSession', sessionId };
		session.headNodeStates = {};
		session.boundFeedSnapshot = null;
		session.feedPersistedEvents = 0;
		session.feedRunOffset = 0;
		session.feedBytes = 0;
		session.feedMarkerRunId = undefined;
		session.persistedNodeStatesJson = '{}';
		session.currentStatus = 'pristine';
		return succeeded(false, true);
	});
};

/**
 * Bind `sessionId`, or leave when `sessionId` is null.
 */
export const selectWorkflowSession = async (
	deps: WorkflowSessionActionDeps,
	sessionId: string | null,
): Promise<WorkflowSessionActionResult> => {
	if (sessionId === null) {
		return leaveWorkflowSession(deps);
	}

	const { session, store } = deps;

	// 1. Refuse an active run.
	const active = refuseRunActive(session);

	if (active !== undefined) {
		return active;
	}

	const workflowId = activeWorkflowId(session);

	if (workflowId === undefined) {
		return failed('NOT_FOUND', 'No workflow is open');
	}

	// 2. Flush the session we are leaving before reading the next file.
	if (session.binding.kind === 'workflowSession') {
		const flushed = await deps.autosave.flush();

		if (!flushed.ok) {
			return flushed;
		}
	}

	// 3. Load the session. Corrupt files are not selectable.
	const loaded = await store.read(workflowId, sessionId);

	if (!loaded.ok) {
		return failed(
			loaded.code === 'CORRUPT' ? 'CORRUPT' : mapStoreCode(loaded.code),
			loaded.message,
		);
	}

	// 4. Remember the saved workflow, then show the snapshot.
	const savedDocument = await rememberSavedWorkflow(
		deps,
		loaded.value.workflowId,
	);
	return bindLoadedSession(deps, loaded.value, savedDocument, true);
};

/**
 * Bind the newest non-corrupt session for the open workflow.
 * No sessions, or only corrupt files, stays on the workflow file.
 * Already bound is a no-op, so leaving via `sessionId: null` is not undone.
 */
export const bindLatestWorkflowSession = async (
	deps: WorkflowSessionActionDeps,
): Promise<WorkflowSessionActionResult> => {
	if (deps.session.binding.kind === 'workflowSession') {
		return succeeded(false, false);
	}

	const workflowId = activeWorkflowId(deps.session);

	if (workflowId === undefined) {
		return succeeded(false, false);
	}

	const listed = await deps.store.list(workflowId);

	if (!listed.ok) {
		return failed(mapStoreCode(listed.code), listed.message);
	}

	const newest = listed.value
		.filter((item) => item.corrupt !== true)
		.sort((left, right) =>
			right.updatedAt.localeCompare(left.updatedAt),
		)[0];

	if (newest === undefined) {
		return succeeded(false, false);
	}

	return selectWorkflowSession(deps, newest.sessionId);
};

/**
 * Flush, unbind, and reload the saved workflow when one is open.
 * Does not clear a live run — callers must refuse `RUN_ACTIVE` first.
 */
export const leaveWorkflowSession = async (
	deps: WorkflowSessionActionDeps,
): Promise<WorkflowSessionActionResult> => {
	const { session } = deps;

	// 1. Refuse an active run.
	const active = refuseRunActive(session);

	if (active !== undefined) {
		return active;
	}

	if (session.binding.kind !== 'workflowSession') {
		return succeeded(false, false);
	}

	// 2. Flush pending snapshot edits before dropping the binding.
	const flushed = await deps.autosave.flush();

	if (!flushed.ok) {
		return flushed;
	}

	const workflowId = activeWorkflowId(session);

	// 3. Unbind. Editor mutations go back to the workflow dirty flag.
	session.binding = { kind: 'workflow' };
	session.headNodeStates = {};
	session.boundFeedSnapshot = undefined;
	session.savedWorkflowDocument = null;

	// 4. Reload the saved workflow when one is open.
	if (workflowId !== undefined) {
		const reloaded = await loadWorkflowIntoSession(
			session,
			deps.workflowService,
			workflowId,
			deps.resolveDefinition,
		);

		if (reloaded.ok && session.activeWorkflow !== null) {
			session.savedWorkflowDocument = session.activeWorkflow;
		}
	}

	// 5. Clear the feed only when no run is active.
	if (session.runnerStatus !== 'running') {
		resetSessionExecutionFeed(session);
	}

	return succeeded(true, true);
};

/**
 * Delete one session file for the open workflow. The bound session is
 * left first. Any other listed file, including a corrupt one that cannot
 * be selected, is removed without changing the binding.
 */
export const deleteWorkflowSession = async (
	deps: WorkflowSessionActionDeps,
	sessionId: string,
): Promise<WorkflowSessionActionResult> => {
	const { session, store } = deps;

	// 1. Refuse an active run.
	const active = refuseRunActive(session);

	if (active !== undefined) {
		return active;
	}

	if (!isSafeWorkflowSessionId(sessionId)) {
		return failed('NOT_FOUND', 'Workflow session was not found');
	}

	const workflowId = activeWorkflowId(session);

	if (workflowId === undefined) {
		return failed('NOT_FOUND', 'No workflow is open');
	}

	let canvasChanged = false;
	let feedChanged = false;

	// 3. Leave the active session before removing its file.
	if (
		session.binding.kind === 'workflowSession' &&
		session.binding.sessionId === sessionId
	) {
		const left = await leaveWorkflowSession(deps);

		if (!left.ok) {
			return left;
		}

		canvasChanged = left.canvasChanged;
		feedChanged = left.feedChanged;
	}

	// 4. Delete the file.
	const removed = await store.delete(workflowId, sessionId);

	if (!removed.ok) {
		return failed(mapStoreCode(removed.code), removed.message);
	}

	return succeeded(canvasChanged, feedChanged);
};

/**
 * Replace the active session snapshot from the saved workflow file.
 * Does not write the workflow file.
 */
export const replaceSnapshotFromWorkflow = async (
	deps: WorkflowSessionActionDeps,
	sessionId: string,
): Promise<WorkflowSessionActionResult> => {
	const { session, store } = deps;

	// 1. Refuse an active run and a stale tab.
	const active =
		refuseRunActive(session) ?? refuseStaleSession(session, sessionId);

	if (active !== undefined) {
		return active;
	}

	const workflowId = activeWorkflowId(session);

	if (workflowId === undefined) {
		return failed('NOT_FOUND', 'No workflow is open');
	}

	// 2. Drop pending session edits. They must not be flushed first.
	deps.autosave.cancel();

	// 3. Load the saved workflow and store it as the snapshot.
	const loaded = await deps.workflowService.load({ workflowId });

	if (!loaded.ok) {
		return failed('NOT_FOUND', loaded.message);
	}

	const written = await store.update(workflowId, sessionId, (current) => ({
		...current,
		workflowSnapshot: loaded.document,
		updatedAt: new Date().toISOString(),
	}));

	if (!written.ok) {
		return failed(mapStoreCode(written.code), written.message);
	}

	// 4. Show the saved workflow. Points stay; staleness is computed later.
	session.savedWorkflowDocument = loaded.document;
	return bindLoadedSession(deps, written.value, loaded.document, false);
};

/**
 * Write the active session graph onto the workflow file.
 * This is the only session action that writes that file.
 */
export const writeSnapshotToWorkflow = async (
	deps: WorkflowSessionActionDeps,
	sessionId: string,
): Promise<WorkflowSessionActionResult> => {
	const { session, store } = deps;

	// 1. Refuse an active run and a stale tab.
	const active =
		refuseRunActive(session) ?? refuseStaleSession(session, sessionId);

	if (active !== undefined) {
		return active;
	}

	// 2. Persist the in-memory snapshot, then save the workflow file.
	const flushed = await deps.autosave.flush();

	if (!flushed.ok) {
		return flushed;
	}

	const payload = buildSaveCurrentPayload(session);

	if (payload === null) {
		return failed('NOT_FOUND', 'No workflow is open');
	}

	const saved = await deps.workflowService.save(payload);

	if (!saved.ok) {
		return failed('WRITE_FAILED', saved.message);
	}

	// 3. Refresh the remembered document so the banner clears.
	session.activeWorkflow = saved.document;
	session.activeWorkflowId = saved.document.workflowId;
	session.savedWorkflowDocument = saved.document;
	session.markPristine();

	const workflowId = saved.document.workflowId;
	const written = await store.update(workflowId, sessionId, (current) => ({
		...current,
		workflowSnapshot: saved.document,
		updatedAt: new Date().toISOString(),
	}));

	if (!written.ok) {
		return failed(mapStoreCode(written.code), written.message);
	}

	return succeeded(true, false);
};

/**
 * Clear one session's conversation. The tab and its graph snapshot stay.
 * Agent head, last-run feed, and points are dropped.
 */
export const resetWorkflowSessionConversation = async (
	deps: WorkflowSessionActionDeps,
	sessionId: string,
): Promise<WorkflowSessionActionResult> => {
	const { session, store } = deps;

	const active =
		refuseRunActive(session) ?? refuseStaleSession(session, sessionId);

	if (active !== undefined) {
		return active;
	}

	const workflowId = activeWorkflowId(session);

	if (workflowId === undefined) {
		return failed('NOT_FOUND', 'No workflow is open');
	}

	const written = await store.update(workflowId, sessionId, (current) => ({
		...current,
		nodeStates: {},
		headOffset: null,
		points: [],
		updatedAt: new Date().toISOString(),
	}));

	if (!written.ok) {
		return failed(mapStoreCode(written.code), written.message);
	}

	const truncated = await store.truncateFeed(workflowId, sessionId, 0);

	if (!truncated.ok && truncated.code !== 'NOT_FOUND') {
		return failed(mapStoreCode(truncated.code), truncated.message);
	}

	session.headNodeStates = {};
	session.boundFeedSnapshot = null;
	session.feedPersistedEvents = 0;
	session.feedRunOffset = 0;
	session.feedBytes = 0;
	session.feedMarkerRunId = undefined;
	session.persistedNodeStatesJson = '{}';
	resetSessionExecutionFeed(session);
	return succeeded(false, true);
};

/**
 * Remove one stored point. This phase does not append points.
 */
export const discardWorkflowSessionPoint = async (
	deps: WorkflowSessionActionDeps,
	sessionId: string,
	pointId: string,
): Promise<WorkflowSessionActionResult> => {
	const { session, store } = deps;

	// 1. Refuse an active run and a stale tab.
	const active =
		refuseRunActive(session) ?? refuseStaleSession(session, sessionId);

	if (active !== undefined) {
		return active;
	}

	if (!isSafeWorkflowSessionId(pointId)) {
		return failed('NOT_FOUND', 'Workflow session point was not found');
	}

	const workflowId = activeWorkflowId(session);

	if (workflowId === undefined) {
		return failed('NOT_FOUND', 'No workflow is open');
	}

	// 2. Remove the point from the file. Missing points do not write.
	const loaded = await store.read(workflowId, sessionId);

	if (!loaded.ok) {
		return failed(mapStoreCode(loaded.code), loaded.message);
	}

	if (!loaded.value.points.some((point) => point.pointId === pointId)) {
		return failed('NOT_FOUND', 'Workflow session point was not found');
	}

	const written = await store.update(workflowId, sessionId, (current) => ({
		...current,
		points: current.points.filter((point) => point.pointId !== pointId),
		updatedAt: new Date().toISOString(),
	}));

	if (!written.ok) {
		return failed(mapStoreCode(written.code), written.message);
	}

	return succeeded(false, false);
};
