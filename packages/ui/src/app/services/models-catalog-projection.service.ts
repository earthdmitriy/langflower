/**
 * Projection of server-pushed live model catalogs.
 *
 * Exposes {@link catalogs$} from {@link LangflowerBridgeService.cached}
 * (`langflower.models.catalog.snapshot`). Eagerly subscribed so the mapped
 * stream stays hot before Inspector mounts; consumers wait via `async` pipe.
 */
import { Injectable, inject } from '@angular/core';
import { map, shareReplay } from 'rxjs';
import { LangflowerBridgeService } from './langflower-bridge.service';

@Injectable({ providedIn: 'root' })
export class ModelsCatalogProjectionService {
	private readonly bridge = inject(LangflowerBridgeService);

	/** Catalog maps after each server snapshot (replayed; no synthetic seed). */
	readonly catalogs$ = this.bridge.cached[
		'langflower.models.catalog.snapshot'
	].pipe(
		map((payload) => payload.catalogs),
		shareReplay({ bufferSize: 1, refCount: false }),
	);

	constructor() {
		this.catalogs$.subscribe();
	}
}
