/**
 * Palette-feature projection of left palette chrome (shown / hidden).
 *
 * Follows server facts only: `session.state.snapshot.paletteVisible`, then
 * live `editor.paletteVisible.snapshot`. Does not emit a local default.
 */
import { Injectable, inject } from '@angular/core';
import { map, merge, shareReplay } from 'rxjs';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';

@Injectable({ providedIn: 'root' })
export class EditorPaletteVisibleProjectionService {
	private readonly bridge = inject(LangflowerBridgeService);

	readonly paletteVisible$ = merge(
		this.bridge.cached['session.state.snapshot'].pipe(
			map((snapshot) => snapshot.paletteVisible),
		),
		this.bridge.cached['editor.paletteVisible.snapshot'],
	).pipe(shareReplay({ bufferSize: 1, refCount: false }));

	requestVisible(visible: boolean): void {
		this.bridge.raw['editor.paletteVisible.requested'].next(visible);
	}

	requestHide(): void {
		this.requestVisible(false);
	}

	requestShow(): void {
		this.requestVisible(true);
	}
}
