import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
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
			readonly runId: RunId;
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

/**
 * Live values received on input ports during execution, keyed by
 * `${nodeId}:${portId}` — backs `inline: 'preview'` port rows so they show
 * the value flowing through the wire while a run is in progress.
 *
 * Event-sourcing fold (same contract as canvas chrome): replace from
 * `executionFeed.snapshot`, append live `runner.input-received`, clear on
 * feed null / new run / workflow switch. Settled values stay after
 * `runner.done` so live settle matches reconnect replay.
 */
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
			this.bridge.raw['runner.input-received'].pipe(
				filter(
					(
						event,
					): event is Extract<
						RuntimeRunnerEvent,
						{ kind: 'input-received' }
					> & { portId: string } =>
						event.kind === 'input-received' &&
						event.state === 'value' &&
						typeof event.portId === 'string',
				),
				map((event): PreviewAction => ({
					type: 'input',
					runId: event.runId,
					nodeId: event.nodeId,
					portId: event.portId,
					value: event.value,
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
					if (action.runId === state.runId) {
						return state;
					}
					return { map: new Map(), runId: action.runId };
				}
				const next = new Map(state.map);
				next.set(
					previewKey(action.nodeId, action.portId),
					action.value,
				);
				return { map: next, runId: action.runId };
			}, emptyPreviewState),
			map((state) => state.map),
		),
		{ initialValue: emptyPreviewState.map },
	);

	valueFor(nodeId: string, portId: string): unknown {
		return this.values().get(previewKey(nodeId, portId));
	}

	/** All known live input values for one node, keyed by `portId`. */
	entriesForNode(nodeId: string): ReadonlyMap<string, unknown> {
		const prefix = `${nodeId}:`;
		const entries = new Map<string, unknown>();

		for (const [key, value] of this.values()) {
			if (key.startsWith(prefix)) {
				entries.set(key.slice(prefix.length), value);
			}
		}

		return entries;
	}
}

const previewKey = (nodeId: string, portId: string): string =>
	`${nodeId}:${portId}`;

const replayPreviewValues = (
	snapshot: ExecutionFeedSnapshotPayload | null,
): ReadonlyMap<string, unknown> => {
	const map = new Map<string, unknown>();
	if (snapshot === null) {
		return map;
	}
	for (const event of snapshot.events) {
		if (
			event.kind !== 'input-received' ||
			event.state !== 'value' ||
			typeof event.portId === 'symbol'
		) {
			continue;
		}
		map.set(previewKey(event.nodeId, event.portId), event.value);
	}
	return map;
};
