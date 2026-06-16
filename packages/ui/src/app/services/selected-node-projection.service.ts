/**
 * Root projection of the canvas selection for late Inspector mounts.
 *
 * Editor shell toggles `<lf-inspector-panel />` on `editor.nodeSelected`, so the
 * panel is created after that one-shot event. This service keeps the latest
 * selected node via `shareReplay` for readers that subscribe after the click.
 */
import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { EditorSelectedNodePayload } from '@langflower/shared/langflower';
import { map, merge, shareReplay, startWith } from 'rxjs';
import { LangflowerBridgeService } from './langflower-bridge.service';

type SelectedNode = EditorSelectedNodePayload['node'];

@Injectable({ providedIn: 'root' })
export class SelectedNodeProjectionService {
	private readonly bridge = inject(LangflowerBridgeService);

	readonly selectedNode$ = merge(
		this.bridge.cached['session.state.snapshot'].pipe(
			map((snapshot) => snapshot.selectedNode),
		),
		this.bridge.raw['editor.nodeSelected'].pipe(
			map((payload) => payload.node),
		),
	).pipe(
		startWith(null as SelectedNode),
		shareReplay({ bufferSize: 1, refCount: false }),
	);

	readonly selectedNode = toSignal(this.selectedNode$, {
		initialValue: null as SelectedNode,
	});

	readonly selectedNodeId = computed(() => this.selectedNode()?.id ?? null);

	readonly hasSelectedNode = computed(() => this.selectedNodeId() !== null);
}
