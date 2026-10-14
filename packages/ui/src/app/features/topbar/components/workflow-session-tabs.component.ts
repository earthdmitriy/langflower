import {
	ChangeDetectionStrategy,
	Component,
	HostListener,
	computed,
	inject,
	signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { WorkflowSessionActionFailedPayload } from '@langflower/shared/types/workflow-session';
import { merge } from 'rxjs';
import { map, scan, startWith } from 'rxjs/operators';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { ComposerService } from '../../composer/composer.service';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { settleParkedRunThen } from '../settle-parked-run';
import {
	foldWorkflowSessionTabs,
	initialWorkflowSessionTabsInput,
	projectWorkflowSessionTabs,
	type WorkflowSessionTabItem,
	type WorkflowSessionTabsEvent,
} from '../types/workflow-session-tabs-projection';

const RUN_IN_PROGRESS_TIP = 'A run is in progress';

@Component({
	selector: 'lf-workflow-session-tabs',
	standalone: true,
	imports: [LfHoverTipComponent],
	host: {
		class: 'relative flex min-w-[14rem] flex-1 flex-nowrap items-center gap-1 self-stretch',
	},
	template: `
		<div
			class="lf-scroll flex h-full min-w-0 flex-1 flex-nowrap items-stretch gap-1 self-stretch overflow-x-auto overflow-y-hidden"
		>
			<div
				class="flex h-full shrink-0 items-stretch gap-1"
				role="tablist"
				aria-label="Workflow sessions"
			>
				@for (tab of view().tabs; track tab.sessionId) {
					<div class="flex h-full shrink-0 items-center">
						<div
							class="relative grid grid-rows-[1fr_auto_1fr]"
							[class.h-full]="tab.active"
							[class.top-1]="!tab.active"
							[class.rounded-md]="!tab.active"
							[class.hover:bg-zinc-100]="!tab.active"
							[class.dark:hover:bg-zinc-800]="!tab.active"
						>
							@if (tab.active) {
								<div
									class="pointer-events-none z-0 col-start-1 row-span-2 row-start-2 mt-1 rounded-t-md border border-b-0 border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"
									aria-hidden="true"
								></div>
							}
							<div
								class="z-10 col-start-1 row-start-2 inline-flex items-center"
								[class.relative]="tab.active"
								[class.top-1]="tab.active"
							>
								<lf-hover-tip
									align="center"
									side="bottom"
									[class.cursor-not-allowed]="
										view().controlsDisabled || tab.corrupt
									"
									[tip]="sessionTip(tab)"
								>
									<button
										type="button"
										role="tab"
										class="inline-flex items-center whitespace-nowrap bg-transparent px-2 py-1 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200"
										[class.font-semibold]="tab.active"
										[disabled]="
											view().controlsDisabled ||
											tab.corrupt
										"
										[attr.aria-selected]="tab.active"
										(click)="selectSession(tab)"
									>
										@if (tab.differs) {
											<span
												class="mr-1.5 h-1.5 w-1.5 shrink-0 translate-y-px rounded-full bg-rose-400/70"
												aria-hidden="true"
											></span>
										}
										{{ tab.label }}
									</button>
								</lf-hover-tip>
								<lf-hover-tip
									align="center"
									side="bottom"
									[class.cursor-not-allowed]="
										view().controlsDisabled
									"
									[tip]="tip('Delete this session')"
								>
									<button
										type="button"
										class="mr-1 inline-flex rounded p-0.5 text-zinc-400 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-500 dark:hover:text-rose-400"
										[attr.aria-label]="
											'Delete session ' + tab.label
										"
										[disabled]="view().controlsDisabled"
										(click)="
											requestDeleteSession(tab, $event)
										"
									>
										<svg
											viewBox="0 0 20 20"
											class="h-3 w-3"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											aria-hidden="true"
										>
											<path d="M6 6l8 8M14 6l-8 8" />
										</svg>
									</button>
								</lf-hover-tip>
							</div>
						</div>
					</div>
				}
			</div>
			<div
				class="sticky right-0 z-10 shrink-0 self-center bg-white pl-1 dark:bg-zinc-900"
			>
				<lf-hover-tip
					class="top-1"
					align="end"
					side="bottom"
					[class.cursor-not-allowed]="view().controlsDisabled"
					[tip]="tip('Create a session')"
				>
					<button
						type="button"
						class="inline-flex items-center justify-center rounded-md border border-zinc-200 p-1.5 text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
						aria-label="New session"
						[disabled]="view().controlsDisabled"
						(click)="createSession()"
					>
						<svg
							viewBox="0 0 20 20"
							class="h-4 w-4"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							aria-hidden="true"
						>
							<path d="M10 4v12M4 10h12" />
						</svg>
					</button>
				</lf-hover-tip>
			</div>
		</div>

		@if (pendingDelete(); as pending) {
			<div
				class="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/40 px-4"
				(click)="cancelDeleteSession()"
			>
				<div
					class="w-72 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="delete-session-title"
					aria-describedby="delete-session-desc"
					(click)="$event.stopPropagation()"
				>
					<h2
						id="delete-session-title"
						class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
					>
						Delete session?
					</h2>
					<p
						id="delete-session-desc"
						class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
					>
						This removes
						<strong>{{ pending.label }}</strong
						>.
					</p>
					<div class="mt-4 flex justify-end gap-2">
						<button
							type="button"
							class="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
							(click)="cancelDeleteSession()"
						>
							Cancel
						</button>
						<button
							type="button"
							class="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
							[disabled]="view().controlsDisabled"
							(click)="confirmDeleteSession()"
						>
							Delete
						</button>
					</div>
				</div>
			</div>
		}

		@if (visibleFailure(); as failure) {
			<div
				class="absolute left-0 top-full z-20 mt-2 w-[28rem] max-w-[min(28rem,calc(100vw-2rem))]"
			>
				<div
					class="rounded-lg border border-rose-300 bg-white p-3 shadow-lg dark:border-rose-800 dark:bg-zinc-900"
					role="alert"
				>
					<p
						class="text-xs leading-5 text-rose-700 dark:text-rose-300"
					>
						{{ failure.message }}
					</p>
					<div class="mt-2 flex justify-end">
						<button
							type="button"
							class="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
							(click)="dismissFailure()"
						>
							Dismiss
						</button>
					</div>
				</div>
			</div>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowSessionTabsComponent {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly execution = inject(WorkflowExecutionService);
	private readonly composer = inject(ComposerService);

	readonly pendingDelete = signal<{
		readonly sessionId: string;
		readonly label: string;
	} | null>(null);

	private readonly dismissedFailure =
		signal<WorkflowSessionActionFailedPayload | null>(null);

	private readonly actionFailure = toSignal(
		this.bridge.raw['workflowSession.action.failed'].pipe(
			map(
				(failure): WorkflowSessionActionFailedPayload | null => failure,
			),
			startWith(null),
		),
		{ initialValue: null },
	);

	readonly view = toSignal(
		merge(
			this.bridge.cached['workflowSession.list.snapshot'].pipe(
				map((snapshot): WorkflowSessionTabsEvent => ({
					type: 'list',
					list: snapshot,
				})),
			),
			this.bridge.cached['workflowSession.current.snapshot'].pipe(
				map((snapshot): WorkflowSessionTabsEvent => ({
					type: 'current',
					current: snapshot,
				})),
			),
			toObservable(this.composer.navigationLocked).pipe(
				map((navigationLocked): WorkflowSessionTabsEvent => ({
					type: 'navigation',
					navigationLocked,
				})),
			),
		).pipe(
			scan(foldWorkflowSessionTabs, initialWorkflowSessionTabsInput),
			map(projectWorkflowSessionTabs),
		),
		{
			initialValue: projectWorkflowSessionTabs(
				initialWorkflowSessionTabsInput,
			),
		},
	);

	readonly visibleFailure = computed(() => {
		const failure = this.actionFailure();
		if (failure === null || failure === this.dismissedFailure()) {
			return null;
		}
		return failure;
	});

	tip(idleTip: string): string {
		return this.view().controlsDisabled ? RUN_IN_PROGRESS_TIP : idleTip;
	}

	sessionTip(tab: WorkflowSessionTabItem): string {
		if (this.view().controlsDisabled) {
			return RUN_IN_PROGRESS_TIP;
		}
		if (tab.corrupt) {
			return 'This session file is corrupt';
		}
		if (tab.differs) {
			return 'The workflow in this session differs from the current workflow.';
		}
		return 'Open this session';
	}

	private settleThen(action: () => void): void {
		void settleParkedRunThen({
			running: this.execution.isRunning(),
			requestInterrupt: () => {
				this.bridge.raw['runner.interrupt.requested'].next('cancel');
			},
			interrupted$: this.bridge.raw['runner.interrupted'],
			action,
		});
	}

	selectSession(tab: WorkflowSessionTabItem): void {
		if (this.view().controlsDisabled || tab.corrupt) {
			return;
		}
		this.pendingDelete.set(null);
		this.settleThen(() => {
			this.bridge.raw['workflowSession.select.requested'].next({
				sessionId: tab.sessionId,
			});
		});
	}

	createSession(): void {
		if (this.view().controlsDisabled) {
			return;
		}
		this.pendingDelete.set(null);
		this.settleThen(() => {
			this.bridge.raw['workflowSession.create.requested'].next({});
		});
	}

	requestDeleteSession(tab: WorkflowSessionTabItem, event: Event): void {
		event.stopPropagation();
		if (this.view().controlsDisabled) {
			return;
		}
		this.pendingDelete.set({
			sessionId: tab.sessionId,
			label: tab.label,
		});
	}

	cancelDeleteSession(): void {
		this.pendingDelete.set(null);
	}

	confirmDeleteSession(): void {
		const pending = this.pendingDelete();
		if (pending === null || this.view().controlsDisabled) {
			this.pendingDelete.set(null);
			return;
		}
		this.settleThen(() => {
			this.bridge.raw['workflowSession.delete.requested'].next({
				sessionId: pending.sessionId,
			});
		});
		this.pendingDelete.set(null);
	}

	dismissFailure(): void {
		this.dismissedFailure.set(this.actionFailure());
	}

	@HostListener('document:keydown.escape')
	protected handleEscape(): void {
		this.pendingDelete.set(null);
		this.dismissFailure();
	}
}
