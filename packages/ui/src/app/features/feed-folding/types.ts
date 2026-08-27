import type { SteerControlPayload } from '@langflower/node-sdk/llm';
import type {
	PortTelemetry,
	RunId,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import type {
	CustomPaletteSnapshotPayload,
	ExecutionFeedSnapshotPayload,
	PaletteConfigPayload,
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
	WorkflowCurrentSnapshotPayload,
} from '@langflower/shared/langflower';
import type { Observable } from 'rxjs';

type FeedPresentation =
	| 'data'
	| 'tool-request'
	| 'tool-response'
	| 'reasoning'
	| 'progress'
	| 'draft'
	| 'tool'
	| 'hitl-user'
	| 'steering-pause'
	| 'steering-resume'
	| 'permission-ask'
	| 'permission-grant'
	| 'permission-deny'
	| 'result'
	| 'recovery'
	| 'shell'
	| 'error';

type FeedVisitBoundary = 'continue' | 'close';

type ToolInteractionMeta = {
	readonly presentation: 'tool-request' | 'tool-response';
	readonly interactionId: string;
	readonly visitBoundary?: FeedVisitBoundary;
	/** Set at normalize when this node is `common-sub-agent`. */
	readonly closesPreviousVisit?: true;
};

type OrdinaryPortFrameMeta = {
	readonly presentation: Exclude<
		FeedPresentation,
		| 'tool-request'
		| 'tool-response'
		| 'hitl-user'
		| 'steering-pause'
		| 'steering-resume'
		| 'permission-ask'
		| 'permission-grant'
		| 'permission-deny'
	>;
	/** Derived from author `feed.streaming !== true` at normalize time. */
	readonly visitBoundary?: FeedVisitBoundary;
	/** Set at normalize when this node is `common-sub-agent`. */
	readonly closesPreviousVisit?: true;
};

type HitlUserMeta = {
	readonly presentation: 'hitl-user';
	readonly origin: 'hitl-reply' | 'steer';
	readonly payload?: SteerControlPayload;
	readonly visitBoundary?: FeedVisitBoundary;
	readonly closesPreviousVisit?: true;
};

type SteeringMeta =
	| {
			readonly presentation: 'steering-pause';
			readonly payload: SteerControlPayload;
			readonly visitBoundary?: FeedVisitBoundary;
			readonly closesPreviousVisit?: true;
	  }
	| {
			readonly presentation: 'steering-resume';
			readonly payload: SteerControlPayload;
			readonly visitBoundary?: FeedVisitBoundary;
			readonly closesPreviousVisit?: true;
	  };

export type PortFrameMeta =
	ToolInteractionMeta | OrdinaryPortFrameMeta | HitlUserMeta | SteeringMeta;

type PermissionDecisionMeta = {
	readonly presentation:
		'permission-ask' | 'permission-grant' | 'permission-deny';
	readonly askId: string;
	readonly authority: 'server';
};

export type PortEventFromServer = {
	readonly source: 'port';
	readonly kind: 'output-emitted' | 'input-received';
	readonly runId: RunId;
	readonly nodeId: string;
	readonly portId: string;
	readonly state: 'value' | 'error' | 'pending';
	readonly value: unknown;
	readonly meta: PortFrameMeta;
};

export type PermissionFeedEvent = {
	readonly source: 'permission';
	readonly kind: 'permission';
	readonly runId: RunId;
	readonly nodeId: string;
	readonly portId: `permission:${string}`;
	readonly state: 'value' | 'error' | 'pending';
	readonly value: unknown;
	readonly meta: PermissionDecisionMeta;
};

export type FeedEventFromSource = PortEventFromServer | PermissionFeedEvent;

export type SequencedFrame = FeedEventFromSource & {
	readonly seq: number;
};

export type PortStreamItem = {
	readonly source: FeedEventFromSource['source'];
	readonly runId: RunId;
	readonly state: FeedEventFromSource['state'];
	readonly value: unknown;
	readonly meta: FeedEventFromSource['meta'];
	readonly seq: number;
};

export type PortEvent = {
	/** Stable id for this chronological segment within the visit. */
	readonly segmentId: string;
	readonly portId: string;
	readonly stream: Observable<readonly PortStreamItem[]>;
};

export type NodeFeedItem = {
	readonly runId: RunId;
	readonly nodeId: string;
	readonly visitId: string;
	readonly isClosed: boolean;
	/** True when this visit has at least one result presentation item. */
	readonly hasResult: boolean;
	/** Last chronological draft segment; hidden in UI when {@link hasResult}. */
	readonly lastDraftSegmentId: string | undefined;
	/**
	 * Live recovery tail in this visit (last item, if it is recovery). Live
	 * `projection$` selector — not a snapshot from the outer `nodeFeed$` map.
	 * Hides `working…` and ticks the wait timer on that stream row only.
	 */
	readonly pinnedRecovery: Observable<PortStreamItem | undefined>;
	readonly foldedEventsFromPorts: Observable<readonly PortEvent[]>;
};

export type FeedBridgeSources = {
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly runnerPort$: Observable<PortTelemetry>;
	readonly runnerStarted$: Observable<RunId>;
	readonly permissionAsk$: Observable<RunnerPermissionAskPayload>;
	readonly permissionAccepted$: Observable<RunnerPermissionReplyPayload>;
	readonly workflowSnapshot$: Observable<WorkflowCurrentSnapshotPayload>;
	readonly paletteSnapshot$: Observable<PaletteConfigPayload>;
	readonly customPaletteSnapshot$: Observable<CustomPaletteSnapshotPayload>;
};

export const isVisitBoundaryClose = (
	meta: FeedEventFromSource['meta'],
): boolean => 'visitBoundary' in meta && meta.visitBoundary === 'close';

export const isClosesPreviousVisit = (
	meta: FeedEventFromSource['meta'],
): boolean =>
	'closesPreviousVisit' in meta && meta.closesPreviousVisit === true;
