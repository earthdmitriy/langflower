/**
 * Root projection of Settings aside chrome (open + scope).
 *
 * Hydrates from `session.state.snapshot.settings`, then follows live
 * `editor.settings.snapshot` facts. Remount-safe for the settings panel.
 */
import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { EditorSettingsSnapshotPayload } from '@langflower/shared/langflower';
import { map, merge, shareReplay, startWith } from 'rxjs';
import { LangflowerBridgeService } from './langflower-bridge.service';

const CLOSED_PROJECT: EditorSettingsSnapshotPayload = {
	open: false,
	scope: 'project',
};

@Injectable({ providedIn: 'root' })
export class EditorSettingsProjectionService {
	private readonly bridge = inject(LangflowerBridgeService);

	readonly settings$ = merge(
		this.bridge.cached['session.state.snapshot'].pipe(
			map((snapshot) => snapshot.settings),
		),
		this.bridge.raw['editor.settings.snapshot'],
	).pipe(
		startWith(CLOSED_PROJECT),
		shareReplay({ bufferSize: 1, refCount: false }),
	);

	readonly settings = toSignal(this.settings$, {
		initialValue: CLOSED_PROJECT,
	});

	readonly open = computed(() => this.settings().open);

	readonly scope = computed(() => this.settings().scope);

	requestOpen(scope: EditorSettingsSnapshotPayload['scope']): void {
		this.bridge.raw['editor.settings.requested'].next({
			open: true,
			scope,
		});
	}

	requestClose(): void {
		this.bridge.raw['editor.settings.requested'].next({ open: false });
	}

	requestScope(scope: EditorSettingsSnapshotPayload['scope']): void {
		this.bridge.raw['editor.settings.requested'].next({
			open: true,
			scope,
		});
	}
}
