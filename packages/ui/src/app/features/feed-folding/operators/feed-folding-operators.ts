import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { NodeFeedItem, PortEvent, PortStreamItem } from '../types';
import { portItemsKey, type FeedProjection } from './feed-projection';

const visitDraftAndResult = (
	projection: FeedProjection,
	visitId: string,
): {
	readonly hasResult: boolean;
	readonly lastDraftSegmentId: string | undefined;
} => {
	const segments = projection.portsByVisit.get(visitId) ?? [];
	let hasResult = false;
	let lastDraftSegmentId: string | undefined;
	for (const segment of segments) {
		const items =
			projection.itemsByPort.get(portItemsKey(segment.segmentId)) ?? [];
		for (const item of items) {
			if (item.meta.presentation === 'result') {
				hasResult = true;
			}
			if (item.meta.presentation === 'draft') {
				lastDraftSegmentId = segment.segmentId;
			}
		}
	}
	return { hasResult, lastDraftSegmentId };
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
