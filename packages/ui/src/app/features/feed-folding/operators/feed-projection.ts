import type { RunId } from '@langflower/runtime';
import type { FeedEventFromSource, PortStreamItem } from '../types';
import { isVisitBoundaryClose } from '../types';
import { foldPortStream } from './fold-port-stream';

type NodeVisitKey = {
	readonly runId: RunId;
	readonly nodeId: string;
	readonly visitId: string;
	readonly isClosed: boolean;
};

/** Chronological port segment within a visit (same portId may re-enter). */
type PortSegmentKey = {
	readonly segmentId: string;
	readonly portId: string;
};

export type FeedProjection = {
	readonly visits: readonly NodeVisitKey[];
	readonly openVisits: ReadonlyMap<string, NodeVisitKey>;
	readonly portsByVisit: ReadonlyMap<string, readonly PortSegmentKey[]>;
	readonly itemsByPort: ReadonlyMap<string, readonly PortStreamItem[]>;
	readonly nextSeq: number;
};

export const emptyFeedProjection = (): FeedProjection => ({
	visits: [],
	openVisits: new Map(),
	portsByVisit: new Map(),
	itemsByPort: new Map(),
	nextSeq: 0,
});

/** Items are keyed by segment id (not visitId+portId). */
export const portItemsKey = (segmentId: string): string => segmentId;

const nodeKey = (runId: RunId, nodeId: string): string => `${runId}:${nodeId}`;

/**
 * Append one normalized feed frame into pre-computed projection state.
 * Snapshots rebuild by replaying this same function over the event sequence.
 *
 * Continue the open visit for `(runId, nodeId)`, or while-last reopen the last
 * visit when it is the same node (setup inputs then streaming, Concat loops).
 * Otherwise open a new visit. Close frames then mark the visit closed;
 * streaming frames leave it open (reopening clears a prior close).
 *
 * Within a visit, continue the last port segment only while `portId` matches;
 * otherwise open a new segment so re-entered ports stay chronological.
 */
export const appendFeedFrame = (
	state: FeedProjection,
	event: FeedEventFromSource,
): FeedProjection => {
	const seq = state.nextSeq;
	const frame = { ...event, seq };
	const key = nodeKey(event.runId, event.nodeId);
	const current = state.openVisits.get(key);
	const last = state.visits[state.visits.length - 1];
	const closes = isVisitBoundaryClose(event.meta);
	// While-open if this node already has an open visit; else while-last when
	// the timeline tail is the same node (streaming may reopen a closed card).
	const canContinue =
		current !== undefined ||
		(last?.runId === event.runId && last?.nodeId === event.nodeId);
	const visit = canContinue
		? (current ?? last!)
		: ({
				runId: event.runId,
				nodeId: event.nodeId,
				visitId: `${event.runId}:${event.nodeId}:${seq}`,
				isClosed: false,
			} satisfies NodeVisitKey);
	const assigned = { ...visit, isClosed: closes };

	const openVisits = new Map(state.openVisits);
	if (closes) {
		openVisits.delete(key);
	} else {
		openVisits.set(key, assigned);
	}

	const visitIndex = state.visits.findIndex(
		(entry) => entry.visitId === assigned.visitId,
	);
	const visits =
		visitIndex === -1
			? [...state.visits, assigned]
			: state.visits.map((entry, index) =>
					index === visitIndex ? assigned : entry,
				);

	const priorSegments = state.portsByVisit.get(assigned.visitId) ?? [];
	const lastSegment = priorSegments[priorSegments.length - 1];
	const segment =
		lastSegment?.portId === event.portId
			? lastSegment
			: ({
					segmentId: `${assigned.visitId}:${seq}`,
					portId: event.portId,
				} satisfies PortSegmentKey);
	const portsByVisit =
		segment === lastSegment
			? state.portsByVisit
			: new Map(state.portsByVisit).set(assigned.visitId, [
					...priorSegments,
					segment,
				]);

	const itemsKey = portItemsKey(segment.segmentId);
	const priorItems = state.itemsByPort.get(itemsKey) ?? [];
	const itemsByPort = new Map(state.itemsByPort);
	itemsByPort.set(itemsKey, foldPortStream(priorItems, frame));

	return {
		visits,
		openVisits,
		portsByVisit,
		itemsByPort,
		nextSeq: seq + 1,
	};
};

/** Replay an ordered normalized sequence through {@link appendFeedFrame}. */
export const replayFeedProjection = (
	events: readonly FeedEventFromSource[],
): FeedProjection => events.reduce(appendFeedFrame, emptyFeedProjection());
