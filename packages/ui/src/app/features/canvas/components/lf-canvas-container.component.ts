import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { combineLatest, map } from 'rxjs';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { mergePaletteCatalogs } from '../../palette/types/palette-projection';
import { FlowCanvasComponent } from './flow-canvas.component';

@Component({
	selector: 'lf-canvas-container',
	standalone: true,
	imports: [FlowCanvasComponent, AsyncPipe],
	template: `
		@if (workflowAndPalette$ | async; as snapshot) {
			@if (snapshot.workflow.activeWorkflow; as activeWorkflow) {
				<!--
				  Remount lf-flow-canvas when the active workflow id changes so
				  hydrateConsumed / provideNgDiagram lifecycle reset. Same-id
				  reseeds still reset the gate inside FlowCanvasComponent.
				-->
				@for (_ of [activeWorkflow.workflowId]; track _) {
					<lf-flow-canvas
						[graphInput]="activeWorkflow.graph"
						[palette]="snapshot.palette"
					/>
				}
			}
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfCanvasContainerComponent {
	private readonly bridge = inject(LangflowerBridgeService);

	private readonly snapshot$ =
		this.bridge.cached['workflow.current.snapshot'];

	/** Wait for real palette snapshots — no empty startWith seed. */
	private readonly palette$ = combineLatest([
		this.bridge.cached['palette.snapshot'],
		this.bridge.cached['customPalette.snapshot'],
	]).pipe(map(([system, custom]) => mergePaletteCatalogs(system, custom)));

	readonly workflowAndPalette$ = combineLatest({
		workflow: this.snapshot$,
		palette: this.palette$,
	});
}
