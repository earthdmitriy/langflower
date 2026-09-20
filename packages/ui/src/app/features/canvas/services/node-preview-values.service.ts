import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { RunId } from '@langflower/runtime';
import { isPortValueTelemetry } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap';
import { merge } from 'rxjs';
import { distinctUntilChanged, filter, map, scan, skip } from 'rxjs/operators';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';

type PreviewAction =
	| {
			readonly type: 'snapshot';
			readonly snap: ExecutionFeedSnapshotPayload | null;
	  }
	| {
			readonly type: 'input';
			readonly nodeId: string;
			readonly portId: string;
			readonly value: unknown;
	  }
	| {
			readonly type: 'reset';
			readonly runId: RunId;
	  }
	| {
			readonly type: 'clear';
	  };

type PreviewState = {
	readonly map: ReadonlyMap<string, unknown>;
	readonly runId: RunId | null;
};

const emptyPreviewState: PreviewState = {
	map: new Map(),
	runId: null,
};

@Injectable({ providedIn: 'root' })
export class NodePreviewValuesService {
	private readonly bridge = inject(LangflowerBridgeService);

	private readonly values = toSignal(
		merge(
			this.bridge.cached['executionFeed.snapshot'].pipe(
				map((snap): PreviewAction => ({
					type: 'snapshot',
					snap,
				})),
			),
			this.bridge.raw['runner.port'].pipe(
				filter(
					(
						event,
					): event is typeof event & {
						readonly 0: 'in';
						readonly 2: string;
						readonly 3: { readonly value: unknown };
					} =>
						isPortValueTelemetry(event) &&
						event[0] === 'in' &&
						typeof event[2] === 'string',
				),
				map((event): PreviewAction => ({
					type: 'input',
					nodeId: String(event[1]),
					portId: event[2],
					value: event[3].value,
				})),
			),
			merge(
				this.bridge.raw['runner.started'],
				this.bridge.raw['runner.startNode.started'],
			).pipe(
				filter((id): id is RunId => typeof id === 'string'),
				map((runId): PreviewAction => ({ type: 'reset', runId })),
			),
			this.bridge.cached['workflow.current.snapshot'].pipe(
				map((snap) => snap.activeWorkflow?.workflowId ?? null),
				distinctUntilChanged(),
				skip(1),
				map((): PreviewAction => ({ type: 'clear' })),
			),
		).pipe(
			scan((state, action): PreviewState => {
				if (action.type === 'snapshot') {
					return {
						map: replayPreviewValues(action.snap),
						runId: action.snap?.runId ?? null,
					};
				}
				if (action.type === 'clear') {
					return emptyPreviewState;
				}
				if (action.type === 'reset') {
					return adoptPreviewRunId(action.runId, state);
				}
				const next = new Map(state.map);
				next.set(
					previewKey(action.nodeId, action.portId),
					action.value,
				);
				return { map: next, runId: state.runId };
			}, emptyPreviewState),
			map((state) => state.map),
		),
		{ initialValue: emptyPreviewState.map },
	);

	valueFor(nodeId: string, portId: string): unknown {
		return this.values().get(previewKey(nodeId, portId));
	}
}

const previewKey = (nodeId: string, portId: string): string =>
	`${nodeId}:${portId}`;

/** Same adopt as chrome: unknown `null` runId is this run, not a wipe. */
const adoptPreviewRunId = (
	runId: RunId,
	previous: PreviewState,
): PreviewState => {
	if (runId === previous.runId) {
		return previous;
	}
	if (previous.runId === null) {
		return { ...previous, runId };
	}
	return { map: new Map(), runId };
};

const replayPreviewValues = (
	snapshot: ExecutionFeedSnapshotPayload | null,
): ReadonlyMap<string, unknown> => {
	const map = new Map<string, unknown>();
	if (snapshot === null) {
		return map;
	}
	for (const event of snapshot.events) {
		if (
			!isPortValueTelemetry(event) ||
			event[0] !== 'in' ||
			typeof event[2] === 'symbol'
		) {
			continue;
		}
		map.set(previewKey(String(event[1]), event[2]), event[3].value);
	}
	return map;
};
