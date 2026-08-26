import { inject, Injectable } from '@angular/core';
import type {
	PortTelemetry,
	RunId,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import { isPortTelemetry, isPortValueTelemetry } from '@langflower/runtime';
import { combineLatest, type Observable } from 'rxjs';
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

/**
 * Per-node canvas chrome: filter bridge facts → fold status + pulse.
 * Simplified node-scoped HITL for ring only — composer HITL stays on ComposerService.
 */
@Injectable({ providedIn: 'root' })
export class CanvasNodeStatusService {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly runnerPort$: Observable<PortTelemetry> = this.bridge.raw[
		'runner.port'
	].pipe(
		filter((event: RuntimeRunnerEvent): event is PortTelemetry =>
			isPortTelemetry(event),
		),
	);
	private readonly sources: CanvasNodeStatusBridgeSources = {
		executionFeedSnapshot$: this.bridge.cached['executionFeed.snapshot'],
		runnerPort$: this.runnerPort$,
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
			this.runnerPort$.pipe(
				filter(
					(event) =>
						event[1] === nodeId &&
						event[0] === 'out' &&
						isPortValueTelemetry(event),
				),
			),
		).pipe(shareReplay({ bufferSize: 1, refCount: false }));

		const entry: NodeStatusCacheEntry = { status$, pulse$ };
		this.cache.set(nodeId, entry);
		return entry;
	}
}

type NodeStatusCacheEntry = {
	readonly status$: Observable<CanvasNodeChromeStatus>;
	readonly pulse$: Observable<boolean>;
};
