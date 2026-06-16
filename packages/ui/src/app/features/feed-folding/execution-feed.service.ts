import { inject, Injectable } from '@angular/core';
import { EMPTY, type Observable } from 'rxjs';
import { LangflowerBridgeService } from '../../services/langflower-bridge.service';
import { foldPortEventsToNodeFeed } from './fold-port-events';
import type { NodeFeedItem } from './types';

/** Bridge-backed owner of the deterministic nested feed feature. */
@Injectable({ providedIn: 'root' })
export class ExecutionFeedService {
	private readonly bridge = inject(LangflowerBridgeService);

	readonly nodeFeed$: Observable<readonly NodeFeedItem[]> =
		foldPortEventsToNodeFeed({
			executionFeedSnapshot$:
				this.bridge.cached['executionFeed.snapshot'],
			outputEmitted$: this.bridge.raw['runner.output-emitted'],
			inputReceived$: this.bridge.raw['runner.input-received'],
			permissionAsk$: this.bridge.raw['runner.permission.ask'] ?? EMPTY,
			permissionAccepted$:
				this.bridge.raw['runner.permission.accepted'] ?? EMPTY,
			workflowSnapshot$: this.bridge.cached['workflow.current.snapshot'],
			paletteSnapshot$: this.bridge.cached['palette.snapshot'],
			customPaletteSnapshot$:
				this.bridge.cached['customPalette.snapshot'],
		});
}
