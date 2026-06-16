import type {
	ExecutionFeedSnapshotPayload,
	RunnerSnapshotPayload,
} from '@langflower/shared/langflower.js';

/** Runner event frame — via shared feed payload (no direct runtime dep). */
export type RuntimeRunnerEvent = ExecutionFeedSnapshotPayload['events'][number];

/** Runner gate status — via shared snapshot payload. */
export type RuntimeRunnerStatus = RunnerSnapshotPayload['status'];
