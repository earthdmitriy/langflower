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

const isPortTelemetry = (
	event: RuntimeRunnerEvent,
): event is Extract<RuntimeRunnerEvent, readonly ['in' | 'out', ...unknown[]]> =>
	Array.isArray(event) && (event[0] === 'in' || event[0] === 'out');

const isRuntimeDone = (
	event: RuntimeRunnerEvent,
): event is Extract<RuntimeRunnerEvent, readonly ['done', ...unknown[]]> =>
	Array.isArray(event) && event[0] === 'done';

export type ExecutionFeedTailState = {
	readonly snapshot: ExecutionFeedSnapshotPayload | null;
	readonly liveAppends: readonly RuntimeRunnerEvent[];
	readonly runnerGate: RuntimeRunnerStatus | null;
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

export const isEventLogAppendKind = (event: RuntimeRunnerEvent): boolean =>
	isPortTelemetry(event) || isRuntimeDone(event);

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

	const nextGate: RuntimeRunnerStatus | null = isRuntimeDone(event)
		? 'idle'
		: state.runnerGate;

	return {
		...state,
		liveAppends: [...state.liveAppends, event],
		runnerGate: nextGate,
		liveRunId:
			isRuntimeDone(event) && event[1] !== undefined
				? String(event[1])
				: state.liveRunId,
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
