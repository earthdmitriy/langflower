import { isPortTelemetry, type RuntimeRunnerEvent } from '@langflower/runtime';
import { buildWorkflowFingerprint } from '@langflower/shared/checkpoint/workflow-fingerprint.js';
import { toCheckpointJsonValue } from '@langflower/shared/checkpoint/json-value.js';
import type {
	WorkflowSessionPoint,
	WorkflowSessionResumeFailedCode,
} from '@langflower/shared/types/workflow-session.js';
import type { RunProgress } from '../checkpoint/run-progress-accumulator.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import type { WorkflowSessionAutosave } from './workflow-session-autosave.js';
import type { WorkflowSessionStore } from './workflow-session-store.js';

const logSessionFailure = (
	sessionId: string,
	code: string,
	nodeId?: string,
): void => {
	const node = nodeId !== undefined ? ` nodeId=${nodeId}` : '';
	process.stderr.write(
		`Langflower workflow session failed: sessionId=${sessionId} code=${code}${node}\n`,
	);
};

/**
 * Fold one `nodeState$` fact into the in-memory head.
 * Non-JSON values are rejected; the previous head entry stays.
 */
export const applyWorkflowSessionNodeState = (
	session: LangflowerSession,
	event: { readonly nodeId: string; readonly state: unknown },
): void => {
	if (session.binding.kind !== 'workflowSession') {
		return;
	}

	const json = toCheckpointJsonValue(event.state);

	if (json === undefined) {
		logSessionFailure(
			session.binding.sessionId,
			'UNSUPPORTED_VALUE',
			event.nodeId,
		);
		return;
	}

	session.headNodeStates = {
		...session.headNodeStates,
		[event.nodeId]: json,
	};
};

/**
 * Flush the bound session head.
 * Closed feed frames are appended. The session record is rewritten only
 * when node state changed. A clean graph is not rewritten.
 */
export const flushWorkflowSessionHead = async (
	session: LangflowerSession,
	store: WorkflowSessionStore,
	autosave: WorkflowSessionAutosave,
): Promise<void> => {
	if (autosave.isDirty()) {
		const snapshotFlush = await autosave.flush();

		if (!snapshotFlush.ok && session.binding.kind === 'workflowSession') {
			logSessionFailure(session.binding.sessionId, snapshotFlush.code);
		}
	}

	if (session.binding.kind !== 'workflowSession') {
		return;
	}

	const workflowId = session.activeWorkflow?.workflowId;

	if (workflowId === undefined) {
		return;
	}

	await appendClosedFeedFrames(session, store);

	const head = { ...session.headNodeStates };
	const headJson = JSON.stringify(head);

	if (headJson === session.persistedNodeStatesJson) {
		return;
	}

	const sessionId = session.binding.sessionId;
	const written = await store.update(workflowId, sessionId, (current) => ({
		...current,
		nodeStates: head,
		updatedAt: new Date().toISOString(),
	}));

	if (!written.ok) {
		logSessionFailure(sessionId, written.code);
		return;
	}

	session.persistedNodeStatesJson = headJson;
};

const GROWING_ROLES = new Set(['reasoning', 'progress', 'draft', 'shell']);

const isOpenStreamingTail = (event: RuntimeRunnerEvent): boolean => {
	if (!isPortTelemetry(event)) {
		return false;
	}

	const feed = event[6];
	const response = event[3];

	return (
		feed?.streaming === true &&
		feed.role !== undefined &&
		GROWING_ROLES.has(feed.role) &&
		typeof response === 'object' &&
		response !== null &&
		'value' in response &&
		typeof response.value === 'string' &&
		!('pending' in response) &&
		!('error' in response) &&
		!('inactive' in response)
	);
};

/**
 * Append a run marker when this run is not on disk yet, then append
 * closed frames. An open streaming tail stays in memory.
 */
export const beginSessionFeedRun = async (
	session: LangflowerSession,
	store: WorkflowSessionStore,
	runId: string,
): Promise<void> => {
	if (
		session.binding.kind !== 'workflowSession' ||
		session.feedMarkerRunId === runId
	) {
		return;
	}

	const workflowId = session.activeWorkflowId;

	if (workflowId === undefined) {
		return;
	}

	const marker = `${JSON.stringify({ kind: 'run', runId, workflowId })}\n`;
	const appended = await store.appendFeed(
		workflowId,
		session.binding.sessionId,
		marker,
	);

	if (!appended.ok) {
		logSessionFailure(session.binding.sessionId, appended.code);
		return;
	}

	session.feedRunOffset = appended.value.sizeBefore;
	session.feedBytes = appended.value.sizeAfter;
	session.feedPersistedEvents = 0;
	session.feedMarkerRunId = runId;
};

const appendClosedFeedFrames = async (
	session: LangflowerSession,
	store: WorkflowSessionStore,
): Promise<void> => {
	if (
		session.binding.kind !== 'workflowSession' ||
		session.runId === undefined
	) {
		return;
	}

	if (session.feedMarkerRunId !== session.runId) {
		await beginSessionFeedRun(session, store, session.runId);
	}

	const events = session.runtime.runner.eventLog;
	const last = events.length - 1;
	const closedCount =
		last >= 0 &&
		events[last] !== undefined &&
		isOpenStreamingTail(events[last])
			? last
			: events.length;
	const pending = events.slice(session.feedPersistedEvents, closedCount);

	if (pending.length === 0) {
		return;
	}

	const chunk = `${pending.map((event) => JSON.stringify(event)).join('\n')}\n`;
	const workflowId = session.activeWorkflowId;

	if (workflowId === undefined) {
		return;
	}

	const appended = await store.appendFeed(
		workflowId,
		session.binding.sessionId,
		chunk,
	);

	if (!appended.ok) {
		logSessionFailure(session.binding.sessionId, appended.code);
		return;
	}

	session.feedBytes = appended.value.sizeAfter;
	session.feedPersistedEvents = closedCount;
};

/** Same trailing window as the graph autosave. */
const HEAD_FLUSH_DELAY_MS = 1000;

/**
 * A port frame that is not a streaming series.
 * Missing feed counts: chat text, string values, preview, `role: 'result'`.
 * `runner.done` is not a port frame.
 */
export const isNonStreamingPortEvent = (event: RuntimeRunnerEvent): boolean =>
	isPortTelemetry(event) && event[6]?.streaming !== true;

export type WorkflowSessionHeadFlush = {
	/** Reset the trailing debounce, then write the head and last-run feed. */
	readonly schedule: () => void;
	/** Write now and drop a pending debounce. */
	readonly flushNow: () => Promise<void>;
};

/**
 * One trailing debounce for the session head.
 * `runner.done` does not write: a finished run has nothing to continue.
 */
export const createWorkflowSessionHeadFlush = (
	session: LangflowerSession,
	store: WorkflowSessionStore,
	autosave: WorkflowSessionAutosave,
	delayMs = HEAD_FLUSH_DELAY_MS,
): WorkflowSessionHeadFlush => {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const clearTimer = (): void => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	const flushNow = (): Promise<void> => {
		clearTimer();
		return flushWorkflowSessionHead(session, store, autosave);
	};

	const schedule = (): void => {
		clearTimer();
		timer = setTimeout(() => {
			timer = undefined;
			void flushWorkflowSessionHead(session, store, autosave);
		}, delayMs);
	};

	return { schedule, flushNow };
};

export type AppendWorkflowSessionPointResult =
	| { readonly ok: true; readonly appended: boolean }
	| {
			readonly ok: false;
			readonly code: string;
			readonly message: string;
	  };

/**
 * Append one immutable point and flush the session file.
 * No bound session writes nothing (no `.langflower/sessions` or runs file).
 */
export const appendWorkflowSessionPoint = async (
	session: LangflowerSession,
	store: WorkflowSessionStore,
	progress: RunProgress,
): Promise<AppendWorkflowSessionPointResult> => {
	if (session.binding.kind !== 'workflowSession') {
		return { ok: true, appended: false };
	}

	const workflow = session.activeWorkflow;

	if (workflow === null) {
		return { ok: true, appended: false };
	}

	const sessionId = session.binding.sessionId;
	await appendClosedFeedFrames(session, store);
	const nodeStates = { ...session.headNodeStates };
	const point: WorkflowSessionPoint = {
		pointId: crypto.randomUUID(),
		runId: progress.runId,
		createdAt: new Date().toISOString(),
		workflowFingerprint: buildWorkflowFingerprint(
			workflow.graph.nodes,
			workflow.graph.edges,
		),
		completedNodeIds: progress.completedNodeIds,
		outputSnapshots: progress.outputSnapshots,
		nodeStates,
		runOffset: session.feedRunOffset,
		feedOffset: session.feedBytes,
		...(progress.label !== undefined ? { label: progress.label } : {}),
		...(progress.unsupported !== undefined
			? { unsupported: progress.unsupported }
			: {}),
	};

	const written = await store.update(
		workflow.workflowId,
		sessionId,
		(current) => ({
			...current,
			points: [...current.points, point],
			updatedAt: new Date().toISOString(),
		}),
	);

	if (!written.ok) {
		logSessionFailure(sessionId, written.code);
		return {
			ok: false,
			code: written.code,
			message: written.message,
		};
	}

	return { ok: true, appended: true };
};

/**
 * Replace the session head with a point. The point itself is not rewritten.
 * Events that happened after that point drop off the head.
 * Uploads stay on disk: a point stores ids only.
 */
export const applyPointToSessionHead = async (
	session: LangflowerSession,
	store: WorkflowSessionStore,
	point: WorkflowSessionPoint,
): Promise<void> => {
	session.headNodeStates = { ...point.nodeStates };

	if (session.binding.kind !== 'workflowSession') {
		return;
	}

	const workflowId = session.activeWorkflowId;

	if (workflowId === undefined) {
		return;
	}

	const sessionId = session.binding.sessionId;
	const slice = await store.readFeedSlice(
		workflowId,
		sessionId,
		point.runOffset,
		point.feedOffset,
	);
	const feed = slice.ok ? slice.value : null;
	session.boundFeedSnapshot = feed;
	session.feedRunOffset = point.runOffset;
	session.feedBytes = point.feedOffset;
	session.feedPersistedEvents = feed?.events.length ?? 0;
	session.feedMarkerRunId = feed?.runId ?? point.runId;

	const truncated = await store.truncateFeed(
		workflowId,
		sessionId,
		point.feedOffset,
	);

	if (!truncated.ok) {
		logSessionFailure(sessionId, truncated.code);
	}

	const written = await store.update(workflowId, sessionId, (current) => ({
		...current,
		nodeStates: { ...point.nodeStates },
		headOffset: null,
		points: current.points.filter(
			(entry) => entry.feedOffset <= point.feedOffset,
		),
		updatedAt: new Date().toISOString(),
	}));

	if (!written.ok) {
		logSessionFailure(sessionId, written.code);
		return;
	}

	session.persistedNodeStatesJson = JSON.stringify(point.nodeStates);
};

export type PointResumeDecision =
	| { readonly ok: true; readonly point: WorkflowSessionPoint }
	| {
			readonly ok: false;
			readonly code: WorkflowSessionResumeFailedCode;
			readonly message: string;
	  };

/**
 * Refuse Continue before the runner starts.
 * `busy` wins over a missing session so an active run is never resumed.
 */
export const decidePointResume = (input: {
	readonly busy: boolean;
	readonly bound: boolean;
	readonly corrupt: boolean;
	readonly corruptMessage?: string;
	readonly point: WorkflowSessionPoint | undefined;
	readonly currentFingerprint: string;
}): PointResumeDecision => {
	if (input.busy) {
		return { ok: false, code: 'BUSY', message: 'A run is already active' };
	}

	if (!input.bound) {
		return {
			ok: false,
			code: 'NO_SESSION',
			message: 'No workflow session is bound',
		};
	}

	if (input.corrupt) {
		return {
			ok: false,
			code: 'CORRUPT',
			message: input.corruptMessage ?? 'Session file is corrupt',
		};
	}

	const point = input.point;

	if (point === undefined) {
		return {
			ok: false,
			code: 'NOT_FOUND',
			message: 'Point is not on the bound session',
		};
	}

	if (point.workflowFingerprint !== input.currentFingerprint) {
		return {
			ok: false,
			code: 'POINT_STALE',
			message: 'Workflow topology changed since this point was written',
		};
	}

	if (point.unsupported !== undefined) {
		return {
			ok: false,
			code: 'UNSUPPORTED_VALUE',
			message: `Unsupported non-JSON output at ${point.unsupported}`,
		};
	}

	return { ok: true, point };
};

export const logWorkflowSessionRestoreFailures = (
	session: LangflowerSession,
): void => {
	if (session.binding.kind !== 'workflowSession') {
		return;
	}

	for (const failure of session.runtime.runner.lastRestoreFailures) {
		logSessionFailure(
			session.binding.sessionId,
			'RESTORE_FAILED',
			failure.nodeId,
		);
	}
};
