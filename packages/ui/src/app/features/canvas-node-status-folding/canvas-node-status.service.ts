import { inject, Injectable } from '@angular/core';
import type { RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import { combineLatest, merge, type Observable } from 'rxjs';
import { filter, map, shareReplay } from 'rxjs/operators';
import { LangflowerBridgeService } from '../../services/langflower-bridge.service';
import { valuePulseActive$ } from '../canvas/utils/value-pulse-active';
import { foldSingleNodeHitlAwaiting } from './fold-canvas-node-hitl';
import { foldSingleNodeCanvasStatus } from './fold-canvas-node-status';
import type {
	CanvasNodeChromeStatus,
	CanvasNodeStatusBridgeSources,
	NodeStatusEvents,
} from './types';

type PortPulseEvent = Extract<
	RuntimeRunnerEvent,
	{ kind: 'output-emitted' | 'input-received' }
>;

type NodeStatusCacheEntry = {
	readonly status$: Observable<CanvasNodeChromeStatus>;
	readonly pulse$: Observable<boolean>;
};

/**
 * Per-node canvas chrome: filter bridge facts → fold status + pulse.
 * Simplified node-scoped HITL for ring only — composer HITL stays on WES.
 */
@Injectable({ providedIn: 'root' })
export class CanvasNodeStatusService {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly sources: CanvasNodeStatusBridgeSources = {
		executionFeedSnapshot$: this.bridge.cached['executionFeed.snapshot'],
		outputEmitted$: this.bridge.raw['runner.output-emitted'],
		inputReceived$: this.bridge.raw['runner.input-received'],
		runnerStarted$: this.bridge.raw['runner.started'].pipe(
			filter((id): id is RunId => typeof id === 'string'),
		),
		runnerStartNodeStarted$: this.bridge.raw[
			'runner.startNode.started'
		].pipe(filter((id): id is RunId => typeof id === 'string')),
		workflowSnapshot$: this.bridge.cached['workflow.current.snapshot'],
		paletteSnapshot$: this.bridge.cached['palette.snapshot'],
		customPaletteSnapshot$: this.bridge.cached['customPalette.snapshot'],
		runnerDone$: this.bridge.raw['runner.done'],
		runnerInterrupted$: this.bridge.raw['runner.interrupted'],
	};
	private readonly cache = new Map<string, NodeStatusCacheEntry>();

	getNodeStatusEvents(nodeId: string): NodeStatusEvents {
		const cached = this.cache.get(nodeId);
		if (cached !== undefined) {
			return cached;
		}

		const chromeStatus$ = foldSingleNodeCanvasStatus(nodeId, this.sources);
		const hitlAwaiting$ = foldSingleNodeHitlAwaiting(nodeId, this.sources);

		const status$ = combineLatest([chromeStatus$, hitlAwaiting$]).pipe(
			map(([chrome, hitlAwaiting]) =>
				hitlAwaiting ? ('hitl' as const) : chrome,
			),
			shareReplay({ bufferSize: 1, refCount: false }),
		);

		const pulse$ = valuePulseActive$(
			merge(
				this.sources.outputEmitted$,
				this.sources.inputReceived$,
			).pipe(
				filter(
					(event): event is PortPulseEvent & { nodeId: string } =>
						(event.kind === 'output-emitted' ||
							event.kind === 'input-received') &&
						event.nodeId === nodeId,
				),
			),
		).pipe(shareReplay({ bufferSize: 1, refCount: false }));

		const entry: NodeStatusCacheEntry = { status$, pulse$ };
		this.cache.set(nodeId, entry);
		return entry;
	}
}
