import { distinctUntilChanged, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { liveRecoveryTail } from '../latest-recovery-item';
import type {
	FeedItemRow,
	FeedRow,
	NodeFeedItem,
	PortEvent,
	PortStreamItem,
} from '../types';
import { portItemsKey, type FeedProjection } from './feed-projection';

const visitDraftAndResult = (
	projection: FeedProjection,
	visitId: string,
): {
	readonly hasResult: boolean;
	readonly lastDraftSegmentId: string | undefined;
	readonly pinnedRecovery: PortStreamItem | undefined;
} => {
	const segments = projection.portsByVisit.get(visitId) ?? [];
	let hasResult = false;
	let lastDraftSegmentId: string | undefined;
	const allItems: PortStreamItem[] = [];
	for (const segment of segments) {
		const items =
			projection.itemsByPort.get(portItemsKey(segment.segmentId)) ?? [];
		allItems.push(...items);
		for (const item of items) {
			if (item.meta.presentation === 'result') {
				hasResult = true;
			}
			if (item.meta.presentation === 'draft') {
				lastDraftSegmentId = segment.segmentId;
			}
		}
	}
	return {
		hasResult,
		lastDraftSegmentId,
		pinnedRecovery: liveRecoveryTail(allItems),
	};
};

/**
 * Nested node/port/item streams select from one shared projection — they do
 * not remap full history.
 */
export const projectNodeFeed = (
	projection$: Observable<FeedProjection>,
): Observable<readonly NodeFeedItem[]> =>
	projection$.pipe(
		map((projection) =>
			projection.visits.map((visit): NodeFeedItem => {
				const { hasResult, lastDraftSegmentId } = visitDraftAndResult(
					projection,
					visit.visitId,
				);
				return {
					runId: visit.runId,
					nodeId: visit.nodeId,
					visitId: visit.visitId,
					isClosed: visit.isClosed,
					hasResult,
					lastDraftSegmentId,
					pinnedRecovery: projection$.pipe(
						map(
							(next) =>
								visitDraftAndResult(next, visit.visitId)
									.pinnedRecovery,
						),
						distinctUntilChanged(
							(left, right) => left?.seq === right?.seq,
						),
					),
					foldedEventsFromPorts: projection$.pipe(
						map((next) =>
							(next.portsByVisit.get(visit.visitId) ?? []).map(
								(segment): PortEvent => ({
									segmentId: segment.segmentId,
									portId: segment.portId,
									stream: projection$.pipe(
										map(
											(
												latest,
											): readonly PortStreamItem[] =>
												latest.itemsByPort.get(
													portItemsKey(
														segment.segmentId,
													),
												) ?? [],
										),
									),
								}),
							),
						),
					),
				};
			}),
		),
	);

const isHiddenLastDraft = (
	item: PortStreamItem,
	segmentId: string,
	hasResult: boolean,
	lastDraftSegmentId: string | undefined,
): boolean =>
	item.meta.presentation === 'draft' &&
	hasResult &&
	segmentId === lastDraftSegmentId;

const headerRowId = (visitId: string): string => `h:${visitId}`;

const itemRowId = (visitId: string, segmentId: string, seq: number): string =>
	`i:${visitId}:${segmentId}:${seq}`;

/**
 * Flatten visits into header + item rows so the work-log window mounts
 * bubbles, not whole cards. Last-draft-when-result is omitted here (not
 * left in the DOM behind an `@if`). Selectors only — does not remap raw
 * history.
 */
export const flattenFeedRows = (
	projection: FeedProjection,
): readonly FeedRow[] => {
	const rows: FeedRow[] = [];
	for (const [visitIndex, visit] of projection.visits.entries()) {
		const { hasResult, lastDraftSegmentId, pinnedRecovery } =
			visitDraftAndResult(projection, visit.visitId);
		rows.push({
			kind: 'header',
			rowId: headerRowId(visit.visitId),
			visitId: visit.visitId,
			nodeId: visit.nodeId,
			runId: visit.runId,
			isClosed: visit.isClosed,
			isFirstVisit: visitIndex === 0,
			hasLiveRecovery: pinnedRecovery !== undefined,
		});

		const segments = projection.portsByVisit.get(visit.visitId) ?? [];
		const visibleSegments: {
			readonly segmentId: string;
			readonly portId: string;
			readonly items: readonly PortStreamItem[];
		}[] = [];
		for (const segment of segments) {
			const items =
				projection.itemsByPort.get(portItemsKey(segment.segmentId)) ??
				[];
			const kept = items.filter(
				(item) =>
					!isHiddenLastDraft(
						item,
						segment.segmentId,
						hasResult,
						lastDraftSegmentId,
					),
			);
			if (kept.length === 0) {
				continue;
			}
			visibleSegments.push({
				segmentId: segment.segmentId,
				portId: segment.portId,
				items: kept,
			});
		}

		const lastSegmentIndex = visibleSegments.length - 1;
		for (
			let segmentIndex = 0;
			segmentIndex < visibleSegments.length;
			segmentIndex += 1
		) {
			const segment = visibleSegments[segmentIndex]!;
			const isLastSegment = segmentIndex === lastSegmentIndex;
			const lastItemIndex = segment.items.length - 1;
			for (
				let itemIndex = 0;
				itemIndex < segment.items.length;
				itemIndex += 1
			) {
				const item = segment.items[itemIndex]!;
				const isLastInVisit =
					isLastSegment && itemIndex === lastItemIndex;
				rows.push({
					kind: 'item',
					rowId: itemRowId(
						visit.visitId,
						segment.segmentId,
						item.seq,
					),
					visitId: visit.visitId,
					nodeId: visit.nodeId,
					runId: visit.runId,
					isClosed: visit.isClosed,
					isLastSegment,
					isLastInVisit,
					isLiveRecovery:
						pinnedRecovery !== undefined &&
						item.seq === pinnedRecovery.seq,
					segmentId: segment.segmentId,
					portId: segment.portId,
					item,
				} satisfies FeedItemRow);
			}
		}
	}
	return rows;
};

export const projectFeedRows = (
	projection$: Observable<FeedProjection>,
): Observable<readonly FeedRow[]> => projection$.pipe(map(flattenFeedRows));
