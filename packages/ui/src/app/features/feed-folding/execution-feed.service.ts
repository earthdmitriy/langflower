import { inject, Injectable } from '@angular/core';
import { EMPTY, filter, type Observable } from 'rxjs';
import { LangflowerBridgeService } from '../../services/langflower-bridge.service';
import { foldPortEventsToNodeFeed } from './fold-port-events';
import type { NodeFeedItem } from './types';
import type { PortTelemetry, RunId } from '@langflower/runtime';
import { isPortTelemetry } from '@langflower/runtime';

/** Bridge-backed owner of the deterministic nested feed feature. */
@Injectable({ providedIn: 'root' })
export class ExecutionFeedService {
	private readonly bridge = inject(LangflowerBridgeService);

	readonly nodeFeed$: Observable<readonly NodeFeedItem[]> =
		foldPortEventsToNodeFeed({
			executionFeedSnapshot$:
				this.bridge.cached['executionFeed.snapshot'],
			runnerPort$: this.bridge.raw['runner.port'].pipe(
				filter((event): event is PortTelemetry => isPortTelemetry(event)),
			),
			runnerStarted$: this.bridge.raw['runner.started'].pipe(
				filter((id): id is RunId => typeof id === 'string'),
			),
			permissionAsk$: this.bridge.raw['runner.permission.ask'] ?? EMPTY,
			permissionAccepted$:
				this.bridge.raw['runner.permission.accepted'] ?? EMPTY,
			workflowSnapshot$: this.bridge.cached['workflow.current.snapshot'],
			paletteSnapshot$: this.bridge.cached['palette.snapshot'],
			customPaletteSnapshot$:
				this.bridge.cached['customPalette.snapshot'],
		});
}
