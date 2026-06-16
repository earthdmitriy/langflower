import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
} from '@angular/core';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service.js';

/**
 * Soft Pause — `{ kind: 'pause' }` on the last feed section's `steerControl`
 * (ADR-032, per-node). Must not call hard interrupt cancel. Visible whenever
 * that feed-last agent is pausable — including while another node already
 * has a Steer HITL tab open.
 */
@Component({
	selector: 'lf-pause-button',
	standalone: true,
	imports: [LfHoverTipComponent],
	template: `
		@if (visible()) {
			<lf-hover-tip [tip]="pauseTip()" align="end">
				<button
					type="button"
					class="lf-composer-icon-btn border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
					aria-label="Pause"
					[disabled]="!canPause()"
					(click)="onPause()"
				>
					<svg
						viewBox="0 0 20 20"
						class="h-4 w-4"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							d="M5.75 3A1.75 1.75 0 0 0 4 4.75v10.5c0 .966.784 1.75 1.75 1.75h1.5A1.75 1.75 0 0 0 9 15.25V4.75A1.75 1.75 0 0 0 7.25 3h-1.5ZM12.75 3A1.75 1.75 0 0 0 11 4.75v10.5c0 .966.784 1.75 1.75 1.75h1.5A1.75 1.75 0 0 0 16 15.25V4.75A1.75 1.75 0 0 0 14.25 3h-1.5Z"
						/>
					</svg>
				</button>
			</lf-hover-tip>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PauseButtonComponent {
	private readonly execution = inject(WorkflowExecutionService);

	readonly visible = computed(
		() =>
			this.execution.isRunning() &&
			this.execution.pausableFeedNodeId() !== null,
	);

	readonly canPause = computed(
		() => this.execution.pausableFeedNodeId() !== null,
	);

	readonly pauseTip = computed(() => {
		// Touch liveness tick so the tip softens while the agent stays quiet.
		this.execution.livenessNowMs();
		return this.execution.pausableFeedIsQuiet()
			? 'API quiet — Pause to nudge'
			: 'Pause — soft interrupt';
	});

	onPause(): void {
		this.execution.requestSoftPause();
	}
}
