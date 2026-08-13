import type { PortTelemetry, RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type {
	CustomPaletteSnapshotPayload,
	ExecutionFeedSnapshotPayload,
	PaletteConfigPayload,
	WorkflowCurrentSnapshotPayload,
} from '@langflower/shared/langflower';
import type { Observable } from 'rxjs';

/** Steady-state canvas node chrome (execution + HITL await). */
export type CanvasNodeChromeStatus =
	'inactive' | 'pending' | 'value' | 'error' | 'hitl';

/** Per-node streams from {@link CanvasNodeStatusService.getNodeStatusEvents}. */
export type NodeStatusEvents = {
	readonly status$: Observable<CanvasNodeChromeStatus>;
	readonly pulse$: Observable<boolean>;
};

/** Chrome fold before HITL overlay (no `hitl`). */
export type CanvasNodeFoldStatus = Exclude<CanvasNodeChromeStatus, 'hitl'>;

export type NodeChromeFoldState = {
	readonly seen: boolean;
	readonly hasError: boolean;
	readonly hasNonStreamingValue: boolean;
	readonly runId: RunId | null;
};

export type CanvasNodeStatusBridgeSources = {
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly runnerPort$: Observable<PortTelemetry>;
	readonly runnerStarted$: Observable<RunId>;
	readonly runnerStartNodeStarted$: Observable<RunId>;
	readonly workflowSnapshot$: Observable<WorkflowCurrentSnapshotPayload>;
	readonly paletteSnapshot$: Observable<PaletteConfigPayload>;
	readonly customPaletteSnapshot$: Observable<CustomPaletteSnapshotPayload>;
	readonly runnerDone$: Observable<unknown>;
	readonly runnerInterrupted$: Observable<unknown>;
};
