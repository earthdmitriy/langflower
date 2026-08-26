import {
	ChangeDetectionStrategy,
	Component,
	Input,
	computed,
	inject,
	signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type {
	RunnerResumeFailedPayload,
	WorkflowCheckpointSummary,
} from '@langflower/shared/langflower';
import { map, merge, scan, startWith } from 'rxjs';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';

type CheckpointUiState = {
	readonly checkpoints: readonly WorkflowCheckpointSummary[];
	readonly resumeError: RunnerResumeFailedPayload | null;
};

const formatCheckpointTime = (iso: string): string => {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}

	return date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
};

const checkpointTitle = (entry: WorkflowCheckpointSummary): string => {
	if (entry.label !== undefined && entry.label.length > 0) {
		return entry.label;
	}

	return `Checkpoint · ${entry.completedNodeIds.length} stage(s)`;
};

@Component({
	selector: 'lf-continue-button',
	standalone: true,
	imports: [LfHoverTipComponent],
	template: `
		@if (resumeError(); as err) {
			<div class="flex min-w-0 flex-col gap-1" [class.w-full]="!compact">
				<p class="lf-text-caption text-rose-700 dark:text-rose-300">
					Resume failed ({{ err.code }}): {{ err.message }}
				</p>
				@if (err.runId; as runId) {
					<lf-hover-tip tip="Discard the failed checkpoint">
						<button
							type="button"
							class="lf-btn lf-btn--ghost rounded-md border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
							(click)="discard(runId)"
						>
							Discard
						</button>
					</lf-hover-tip>
				}
			</div>
		} @else if (hasCheckpoints()) {
			<div
				class="flex min-w-0 flex-col gap-1.5"
				[class.w-full]="!compact"
			>
				<button
					type="button"
					class="lf-btn lf-btn--ghost flex w-full items-center justify-between gap-2 rounded-md border border-sky-400 bg-sky-50 px-3 py-1.5 text-sky-700 transition hover:bg-sky-100 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/60"
					[attr.aria-expanded]="pickerOpen()"
					(click)="togglePicker()"
				>
					<span class="lf-text-caption font-medium">
						Continue from…
						<span class="opacity-70">
							({{ resumableCount() }})
						</span>
					</span>
					<span class="lf-text-caption opacity-60" aria-hidden="true">
						{{ pickerOpen() ? '▴' : '▾' }}
					</span>
				</button>

				@if (pickerOpen()) {
					<ul
						class="lf-scroll flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900"
						role="listbox"
						aria-label="Resumable checkpoints"
					>
						@for (entry of checkpoints(); track entry.runId) {
							<li
								class="flex min-w-0 flex-col gap-1 rounded px-2 py-1.5"
								[class.bg-rose-50]="
									entry.corrupt === true ||
									entry.stale === true
								"
								[class.dark:bg-rose-950/30]="
									entry.corrupt === true ||
									entry.stale === true
								"
							>
								<div
									class="flex min-w-0 items-start justify-between gap-2"
								>
									<div class="min-w-0 flex-1">
										<p
											class="lf-text-caption truncate font-medium text-zinc-800 dark:text-zinc-100"
										>
											{{ titleFor(entry) }}
										</p>
										<p
											class="lf-text-caption truncate text-zinc-500 dark:text-zinc-400"
										>
											{{ formatTime(entry.updatedAt) }}
											· {{ entry.status }}
											@if (entry.stale === true) {
												· stale
											}
											@if (entry.corrupt === true) {
												· corrupt
											}
										</p>
									</div>
									<div class="flex shrink-0 gap-1">
										@if (
											canResumeEntry(entry) &&
											!isRunning()
										) {
											<button
												type="button"
												class="lf-btn lf-btn--ghost rounded border border-sky-400 px-2 py-0.5 text-sky-700 dark:border-sky-500 dark:text-sky-300"
												(click)="
													continueFrom(entry.runId)
												"
											>
												Continue
											</button>
										}
										<button
											type="button"
											class="lf-btn lf-btn--ghost rounded border border-zinc-300 px-2 py-0.5 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
											(click)="discard(entry.runId)"
										>
											Discard
										</button>
									</div>
								</div>
							</li>
						}
					</ul>
				}
			</div>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContinueButtonComponent {
	@Input() compact = false;

	private readonly bridge = inject(LangflowerBridgeService);
	private readonly execution = inject(WorkflowExecutionService);

	readonly isRunning = this.execution.isRunning;
	readonly pickerOpen = signal(false);

	private readonly uiState = toSignal(
		merge(
			this.bridge.cached['runner.checkpoints.snapshot'].pipe(
				map(
					(snapshot) =>
						({
							type: 'snapshot' as const,
							checkpoints: snapshot.checkpoints,
						}) as const,
				),
			),
			this.bridge.raw['runner.resume.failed'].pipe(
				map((error) => ({ type: 'error' as const, error }) as const),
			),
			this.bridge.raw['runner.resume.started'].pipe(
				map(() => ({ type: 'clearError' as const }) as const),
			),
			this.bridge.raw['runner.started'].pipe(
				map(() => ({ type: 'clearError' as const }) as const),
			),
		).pipe(
			scan(
				(state: CheckpointUiState, action): CheckpointUiState => {
					switch (action.type) {
						case 'snapshot':
							return {
								checkpoints: action.checkpoints,
								resumeError: null,
							};
						case 'error':
							return {
								checkpoints: state.checkpoints,
								resumeError: action.error,
							};
						case 'clearError':
							return {
								checkpoints: state.checkpoints,
								resumeError: null,
							};
					}
				},
				{ checkpoints: [], resumeError: null },
			),
			startWith({
				checkpoints: [] as WorkflowCheckpointSummary[],
				resumeError: null as RunnerResumeFailedPayload | null,
			}),
		),
		{
			initialValue: {
				checkpoints: [],
				resumeError: null,
			} satisfies CheckpointUiState,
		},
	);

	readonly resumeError = computed(() => this.uiState().resumeError);

	readonly checkpoints = computed(() => this.uiState().checkpoints);

	readonly hasCheckpoints = computed(
		() => this.checkpoints().length > 0 && !this.isRunning(),
	);

	readonly resumableCount = computed(() => this.checkpoints().length);

	togglePicker(): void {
		this.pickerOpen.update((open) => !open);
	}

	titleFor(entry: WorkflowCheckpointSummary): string {
		return checkpointTitle(entry);
	}

	formatTime(iso: string): string {
		return formatCheckpointTime(iso);
	}

	canResumeEntry(entry: WorkflowCheckpointSummary): boolean {
		return (
			entry.corrupt !== true &&
			entry.stale !== true &&
			entry.completedNodeIds.length > 0 &&
			(entry.status === 'stopped' ||
				entry.status === 'failed' ||
				entry.status === 'running')
		);
	}

	continueFrom(runId: string): void {
		this.pickerOpen.set(false);
		this.bridge.raw['runner.resume.requested'].next({ runId });
	}

	discard(runId: string): void {
		this.bridge.raw['runner.checkpoint.discard.requested'].next({ runId });
	}
}
