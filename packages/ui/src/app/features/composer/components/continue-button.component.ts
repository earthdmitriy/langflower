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
	WorkflowSessionPointSummary,
	WorkflowSessionResumeFailedPayload,
} from '@langflower/shared/types/workflow-session';
import { map, merge, scan, startWith } from 'rxjs';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';

type PointUiState = {
	readonly sessionId: string | null;
	readonly points: readonly WorkflowSessionPointSummary[];
	readonly resumeError: WorkflowSessionResumeFailedPayload | null;
};

const formatPointTime = (iso: string): string => {
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

const pointTitle = (entry: WorkflowSessionPointSummary): string => {
	if (entry.label !== undefined && entry.label.length > 0) {
		return entry.label;
	}

	return 'Checkpoint';
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
				@if (err.pointId; as pointId) {
					@if (sessionId(); as activeSessionId) {
						<lf-hover-tip tip="Discard this point">
							<button
								type="button"
								class="lf-btn lf-btn--ghost rounded-md border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
								(click)="discard(activeSessionId, pointId)"
							>
								Discard
							</button>
						</lf-hover-tip>
					}
				}
			</div>
		} @else if (hasPoints()) {
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
						aria-label="Session points"
					>
						@for (entry of points(); track entry.pointId) {
							<li
								class="flex min-w-0 flex-col gap-1 rounded px-2 py-1.5"
								[class.bg-rose-50]="
									entry.stale === true ||
									entry.unsupported !== undefined
								"
								[class.dark:bg-rose-950/30]="
									entry.stale === true ||
									entry.unsupported !== undefined
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
											{{ formatTime(entry.createdAt) }}
											@if (entry.stale === true) {
												· stale
											}
											@if (entry.unsupported) {
												· unsupported
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
													continueFrom(entry.pointId)
												"
											>
												Continue
											</button>
										}
										@if (sessionId(); as activeSessionId) {
											<button
												type="button"
												class="lf-btn lf-btn--ghost rounded border border-zinc-300 px-2 py-0.5 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300"
												(click)="
													discard(
														activeSessionId,
														entry.pointId
													)
												"
											>
												Discard
											</button>
										}
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
			this.bridge.cached['workflowSession.current.snapshot'].pipe(
				map(
					(snapshot) =>
						({
							type: 'snapshot' as const,
							sessionId: snapshot.sessionId,
							points: snapshot.points,
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
				(state: PointUiState, action): PointUiState => {
					switch (action.type) {
						case 'snapshot':
							return {
								sessionId: action.sessionId,
								points: action.points,
								resumeError: null,
							};
						case 'error':
							return {
								sessionId: state.sessionId,
								points: state.points,
								resumeError: action.error,
							};
						case 'clearError':
							return {
								sessionId: state.sessionId,
								points: state.points,
								resumeError: null,
							};
					}
				},
				{ sessionId: null, points: [], resumeError: null },
			),
			startWith({
				sessionId: null as string | null,
				points: [] as WorkflowSessionPointSummary[],
				resumeError: null as WorkflowSessionResumeFailedPayload | null,
			}),
		),
		{
			initialValue: {
				sessionId: null,
				points: [],
				resumeError: null,
			} satisfies PointUiState,
		},
	);

	readonly resumeError = computed(() => this.uiState().resumeError);
	readonly sessionId = computed(() => this.uiState().sessionId);
	readonly points = computed(() => this.uiState().points);

	readonly hasPoints = computed(
		() => this.points().length > 0 && !this.isRunning(),
	);

	readonly resumableCount = computed(() => this.points().length);

	togglePicker(): void {
		this.pickerOpen.update((open) => !open);
	}

	titleFor(entry: WorkflowSessionPointSummary): string {
		return pointTitle(entry);
	}

	formatTime(iso: string): string {
		return formatPointTime(iso);
	}

	canResumeEntry(entry: WorkflowSessionPointSummary): boolean {
		return entry.stale !== true && entry.unsupported === undefined;
	}

	continueFrom(pointId: string): void {
		this.pickerOpen.set(false);
		this.bridge.raw['runner.resume.requested'].next({ pointId });
	}

	discard(sessionId: string, pointId: string): void {
		this.bridge.raw['workflowSession.discardPoint.requested'].next({
			sessionId,
			pointId,
		});
	}
}
