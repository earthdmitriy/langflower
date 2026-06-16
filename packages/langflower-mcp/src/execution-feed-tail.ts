import type {
	ExecutionFeedSnapshotPayload,
	ExecutionProgressStatus,
	RunnerSnapshotPayload,
} from '@langflower/shared/langflower.js';
import { deriveExecutionProgressStatus } from '@langflower/shared/langflower.js';
import type {
	RuntimeRunnerEvent,
	RuntimeRunnerStatus,
} from './runtime-event-types.js';

/**
 * Snapshot-canonical MCP feed projection (ADR-024).
 * Base = last `executionFeed.snapshot`; live appends = eventLog kinds only.
 * Progress status comes from runner gate (snapshot / start / interrupt / done),
 * not from inferring idle solely via `kind === 'done'`.
 */
export type ExecutionFeedTailState = {
	readonly snapshot: ExecutionFeedSnapshotPayload | null;
	readonly liveAppends: readonly RuntimeRunnerEvent[];
	readonly runnerGate: RuntimeRunnerStatus | null;
	/** Set when a run starts before a new feed snapshot arrives. */
	readonly liveRunId: string | null;
};

export type ExecutionFeedTail = {
	readonly total: number;
	readonly limit: number;
	readonly runId: string | null;
	readonly status: ExecutionProgressStatus | null;
	readonly events: readonly RuntimeRunnerEvent[];
};

const emptyState = (): ExecutionFeedTailState => ({
	snapshot: null,
	liveAppends: [],
	runnerGate: null,
	liveRunId: null,
});

/** Kinds persisted in `RuntimeRunner.eventLog` / `executionFeed.snapshot`. */
export const isEventLogAppendKind = (event: RuntimeRunnerEvent): boolean =>
	event.kind === 'output-emitted' ||
	event.kind === 'input-received' ||
	event.kind === 'done';

export const createExecutionFeedTailState = (): ExecutionFeedTailState =>
	emptyState();

export const applyFeedSnapshot = (
	state: ExecutionFeedTailState,
	snap: ExecutionFeedSnapshotPayload | null,
): ExecutionFeedTailState => ({
	...state,
	snapshot: snap,
	liveAppends: [],
	liveRunId: null,
});

export const applyRunnerSnapshot = (
	state: ExecutionFeedTailState,
	snap: RunnerSnapshotPayload,
): ExecutionFeedTailState => ({
	...state,
	runnerGate: snap.status,
	liveRunId: snap.runId !== undefined ? String(snap.runId) : state.liveRunId,
});

export const applyRunStarted = (
	state: ExecutionFeedTailState,
	runId: string,
): ExecutionFeedTailState => ({
	snapshot: null,
	liveAppends: [],
	runnerGate: 'running',
	liveRunId: runId,
});

export const applyRunInterrupted = (
	state: ExecutionFeedTailState,
): ExecutionFeedTailState => ({
	...state,
	runnerGate: 'stopped',
});

export const appendEventLogFrame = (
	state: ExecutionFeedTailState,
	event: RuntimeRunnerEvent,
): ExecutionFeedTailState => {
	if (!isEventLogAppendKind(event)) {
		return state;
	}

	const nextGate: RuntimeRunnerStatus | null =
		event.kind === 'done' ? 'idle' : state.runnerGate;

	return {
		...state,
		liveAppends: [...state.liveAppends, event],
		runnerGate: nextGate,
		liveRunId:
			typeof event.runId === 'string' ? event.runId : state.liveRunId,
	};
};

export const buildExecutionFeedTail = (
	state: ExecutionFeedTailState,
	limit: number,
): ExecutionFeedTail => {
	const events = [...(state.snapshot?.events ?? []), ...state.liveAppends];
	const runId =
		state.liveRunId ??
		(state.snapshot !== null ? String(state.snapshot.runId) : null);
	const status: ExecutionProgressStatus | null =
		state.runnerGate !== null
			? deriveExecutionProgressStatus(state.runnerGate, events)
			: (state.snapshot?.status ?? null);
	const safeLimit = Math.max(1, Math.floor(limit));
	const sliced = events.slice(Math.max(0, events.length - safeLimit));

	return {
		total: events.length,
		limit: safeLimit,
		runId,
		status,
		events: sliced,
	};
};
