import { isPortValueTelemetry } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap';
import { merge, type Observable } from 'rxjs';
import { map, scan, shareReplay, startWith } from 'rxjs/operators';
import type { OutputPortTelemetry } from './execution-chrome-fold';

export type LatestOutputAction =
	| {
			readonly type: 'snapshot';
			readonly events: ExecutionFeedSnapshotPayload['events'];
	  }
	| { readonly type: 'event'; readonly event: OutputPortTelemetry };

export const foldLatestOutputValues = (
	values: ReadonlyMap<string, unknown>,
	action: LatestOutputAction,
): ReadonlyMap<string, unknown> => {
	if (action.type === 'snapshot') {
		const next = new Map<string, unknown>();
		for (const event of action.events) {
			if (
				isPortValueTelemetry(event) &&
				event[0] === 'out' &&
				typeof event[2] === 'string'
			) {
				next.set(`${event[1]}:${event[2]}`, event[3].value);
			}
		}
		return next;
	}
	const [, nodeId, portId, response] = action.event;
	if (typeof portId !== 'string' || !('value' in response)) {
		return values;
	}
	const next = new Map(values);
	next.set(`${nodeId}:${portId}`, response.value);
	return next;
};

export const createLatestOutputValues$ = (deps: {
	readonly executionFeedSnapshot$: Observable<ExecutionFeedSnapshotPayload | null>;
	readonly outputEmitted$: Observable<OutputPortTelemetry>;
}): Observable<ReadonlyMap<string, unknown>> =>
	merge(
		deps.executionFeedSnapshot$.pipe(
			map((snapshot): LatestOutputAction => ({
				type: 'snapshot',
				events: snapshot?.events ?? [],
			})),
		),
		deps.outputEmitted$.pipe(
			map((event): LatestOutputAction => ({
				type: 'event',
				event,
			})),
		),
	).pipe(
		scan(foldLatestOutputValues, new Map<string, unknown>()),
		startWith(new Map<string, unknown>()),
		shareReplay(1),
	);
