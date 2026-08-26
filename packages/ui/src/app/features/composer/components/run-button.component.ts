import {
	ChangeDetectionStrategy,
	Component,
	Input,
	computed,
	inject,
} from '@angular/core';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { SelectedNodeProjectionService } from '../../../services/selected-node-projection.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import type { NodeId } from '@langflower/runtime';

@Component({
	selector: 'lf-run-button',
	standalone: true,
	imports: [LfHoverTipComponent],
	template: `
		@if (isRunning()) {
			<lf-hover-tip tip="Stop — cancel run" align="start">
				<button
					type="button"
					class="lf-composer-icon-btn border border-rose-400 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-500 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
					aria-label="Stop"
					(click)="toggle()"
				>
					<svg
						viewBox="0 0 20 20"
						class="h-4 w-4"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							d="M5.25 3A2.25 2.25 0 0 0 3 5.25v9.5A2.25 2.25 0 0 0 5.25 17h9.5A2.25 2.25 0 0 0 17 14.75v-9.5A2.25 2.25 0 0 0 14.75 3h-9.5Z"
						/>
					</svg>
				</button>
			</lf-hover-tip>
		} @else {
			<lf-hover-tip [tip]="disabledTip()">
				<button
					type="button"
					class="lf-composer-pill border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
					[class.w-full]="!compact"
					[class.shrink-0]="compact"
					[disabled]="isDisabled()"
					(click)="toggle()"
				>
					{{ buttonLabel() }}
				</button>
			</lf-hover-tip>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunButtonComponent {
	/** Compact chrome placement (composer header) — not full-width. */
	@Input() compact = false;

	private readonly bridge = inject(LangflowerBridgeService);
	private readonly execution = inject(WorkflowExecutionService);
	private readonly selection = inject(SelectedNodeProjectionService);

	/**
	 * Root `shareReplay` selection — remount (HITL compact) must not reset
	 * Run-from-node scope to null (BUG-2026-07-17b).
	 */
	private readonly selectedNodeId = this.selection.selectedNodeId;

	readonly isRunning = this.execution.isRunning;

	/**
	 * Stop stays clickable while a run is active. Run uses the singleton
	 * graph projection — remounting this button (footer ↔ composer chrome)
	 * must not wait for a replayed `workflow.current.snapshot`.
	 */
	readonly isDisabled = computed(() => {
		if (this.isRunning()) {
			return false;
		}
		if (!this.execution.hasRunnableGraph()) {
			return true;
		}
		const nodeId = this.selectedNodeId();
		if (nodeId !== null) {
			// Chat-entry clusters start from the composer, not Run-from-node.
			return this.execution.nodeClusterRequiresChatEntry(nodeId);
		}
		return !this.execution.hasPlainStartTargets();
	});

	readonly disabledTip = computed(() => {
		if (!this.isDisabled()) {
			return '';
		}
		if (!this.execution.hasRunnableGraph()) {
			return 'Load a workflow with nodes to run';
		}
		const nodeId = this.selectedNodeId();
		if (
			nodeId !== null &&
			this.execution.nodeClusterRequiresChatEntry(nodeId)
		) {
			return 'Start this cluster from the Chat Input composer';
		}
		if (!this.execution.hasPlainStartTargets()) {
			return 'This graph starts from Chat Input — use Start in the composer';
		}
		return 'Cannot run right now';
	});

	readonly buttonLabel = computed(() => {
		if (this.isRunning()) {
			return 'Stop';
		}

		return this.selectedNodeId() !== null ? 'Run from node' : 'Run';
	});

	toggle(): void {
		if (this.isRunning()) {
			this.bridge.raw['runner.interrupt.requested'].next('cancel');
			return;
		}

		const nodeId = this.selectedNodeId();

		if (nodeId !== null) {
			if (this.execution.nodeClusterRequiresChatEntry(nodeId)) {
				return;
			}
			this.bridge.raw['runner.startNode.requested'].next([
				nodeId as NodeId,
				undefined,
			]);
			return;
		}

		if (!this.execution.hasPlainStartTargets()) {
			return;
		}

		this.bridge.raw['runner.start.requested'].next([{}, undefined]);
	}
}
