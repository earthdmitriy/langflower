import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	HostListener,
	computed,
	inject,
	signal,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { merge, scan, startWith } from 'rxjs';
import { map } from 'rxjs/operators';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import {
	initialWorkflowTopbarState,
	workflowChangeControlTip,
	workflowTopbarWithCurrentSnapshot,
	workflowTopbarWithCurrentStatus,
	workflowTopbarWithList,
} from '../types/workflow-topbar-projection';

@Component({
	selector: 'lf-workflow-topbar',
	standalone: true,
	imports: [LfHoverTipComponent],
	template: `
		<div class="relative flex min-w-0 items-center gap-2">
			<lf-hover-tip tip="Show workflows" align="center" side="bottom">
				<button
					type="button"
					class="rounded-md border border-zinc-200 p-1 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
					aria-label="Show workflows"
					[attr.aria-expanded]="isDropdownOpen()"
					(click)="toggleDropdown()"
				>
					<svg
						viewBox="0 0 20 20"
						class="h-4 w-4"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
						/>
					</svg>
				</button>
			</lf-hover-tip>

			@if (isRenaming()) {
				<input
					#renameInput
					type="text"
					class="min-w-0 rounded-md border border-zinc-400 bg-white px-2 py-1 text-sm text-zinc-950 outline-none ring-2 ring-zinc-400/20 dark:border-zinc-500 dark:bg-zinc-950 dark:text-zinc-100"
					[value]="renameDraft()"
					(input)="renameDraft.set($any($event.target).value)"
					(keydown.enter)="commitRename()"
					(keydown.escape)="cancelRename()"
					(blur)="commitRename()"
					aria-label="Rename workflow"
				/>
			} @else {
				<lf-hover-tip
					align="center"
					side="bottom"
					[class.cursor-not-allowed]="!canRename()"
					[tip]="renameTip()"
				>
					<button
						type="button"
						class="truncate rounded-md px-2 py-1 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
						[disabled]="!canRename()"
						(click)="startRename()"
					>
						{{ activeWorkflowName() ?? 'No workflow loaded' }}
					</button>
				</lf-hover-tip>
			}

			<lf-hover-tip [tip]="saveTip()" align="center" side="bottom">
				<button
					type="button"
					class="rounded-md border px-3 py-1 text-xs font-medium transition disabled:opacity-50"
					[class.border-zinc-400]="isDirty()"
					[class.bg-zinc-50]="isDirty()"
					[class.text-zinc-700]="isDirty()"
					[class.dark:border-zinc-500]="isDirty()"
					[class.dark:bg-zinc-950/40]="isDirty()"
					[class.dark:text-zinc-300]="isDirty()"
					[class.border-zinc-200]="!isDirty()"
					[class.text-zinc-700]="!isDirty()"
					[class.dark:border-zinc-700]="!isDirty()"
					[class.dark:text-zinc-200]="!isDirty()"
					[disabled]="!canSave()"
					(click)="saveCurrent()"
				>
					Save
				</button>
			</lf-hover-tip>

			<lf-hover-tip
				align="center"
				side="bottom"
				[class.cursor-not-allowed]="!canDelete()"
				[tip]="deleteTip()"
			>
				<button
					type="button"
					class="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-rose-300 dark:hover:bg-rose-950/30"
					[disabled]="!canDelete()"
					(click)="requestDelete()"
				>
					Delete
				</button>
			</lf-hover-tip>

			@if (isDropdownOpen()) {
				<div
					class="lf-scroll absolute left-0 top-full z-20 mt-2 max-h-72 w-80 overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
					role="listbox"
					aria-label="Workflows"
				>
					<lf-hover-tip
						[tip]="createTip()"
						align="start"
						side="bottom"
						class="w-full"
						[class.cursor-not-allowed]="isRunning()"
					>
						<button
							type="button"
							class="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
							role="option"
							[disabled]="isRunning()"
							(click)="createWorkflow()"
						>
							New
						</button>
					</lf-hover-tip>
					@if (workflows().length > 0) {
						<div
							class="my-1 border-t border-zinc-200 dark:border-zinc-700"
							role="separator"
						></div>
					}
					@for (workflow of workflows(); track workflow.workflowId) {
						<div
							class="flex items-stretch gap-1 px-1 py-0.5"
							[class.bg-zinc-100]="
								workflow.workflowId === activeWorkflowId()
							"
							[class.dark:bg-zinc-800]="
								workflow.workflowId === activeWorkflowId()
							"
							role="option"
							[attr.aria-selected]="
								workflow.workflowId === activeWorkflowId()
							"
						>
							<lf-hover-tip
								[tip]="loadTip()"
								align="start"
								side="bottom"
								class="min-w-0 flex-1"
								[class.cursor-not-allowed]="isRunning()"
							>
								<button
									type="button"
									class="flex min-w-0 w-full flex-col items-start rounded-md px-2 py-2 text-left text-sm transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800"
									[disabled]="isRunning()"
									(click)="loadWorkflow(workflow.workflowId)"
								>
									<span
										class="truncate font-medium text-zinc-900 dark:text-zinc-100"
									>
										{{ workflow.name }}
									</span>
									<span
										class="truncate text-xs text-zinc-500 dark:text-zinc-400"
									>
										{{ workflow.workflowId }}
									</span>
								</button>
							</lf-hover-tip>
							<lf-hover-tip
								[tip]="copyTip()"
								align="center"
								side="bottom"
								[class.cursor-not-allowed]="isRunning()"
							>
								<button
									type="button"
									class="shrink-0 self-center rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
									aria-label="Copy workflow"
									[disabled]="isRunning()"
									(click)="
										copyWorkflow(
											workflow.workflowId,
											$event
										)
									"
								>
									Copy
								</button>
							</lf-hover-tip>
						</div>
					} @empty {
						<p
							class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400"
						>
							No workflows available
						</p>
					}
				</div>
			}

			@if (showDeleteConfirm()) {
				<div
					class="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
					role="alertdialog"
					aria-labelledby="delete-workflow-title"
					aria-describedby="delete-workflow-desc"
				>
					<h2
						id="delete-workflow-title"
						class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
					>
						Delete workflow?
					</h2>
					<p
						id="delete-workflow-desc"
						class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
					>
						This removes
						<strong>{{ activeWorkflowName() }}</strong> from disk.
					</p>
					<div class="mt-4 flex justify-end gap-2">
						<button
							type="button"
							class="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
							(click)="cancelDelete()"
						>
							Cancel
						</button>
						<button
							type="button"
							class="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
							(click)="confirmDelete()"
						>
							Delete
						</button>
					</div>
				</div>
			}

			@if (repairNotice(); as notice) {
				<div
					class="absolute left-0 top-full z-20 mt-2 w-96 max-w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-lg dark:border-amber-800 dark:bg-amber-950/40"
					role="status"
					aria-live="polite"
				>
					<p
						class="text-xs leading-5 text-amber-950 dark:text-amber-100"
					>
						{{ notice }}
					</p>
					<div class="mt-2 flex justify-end">
						<button
							type="button"
							class="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/50"
							(click)="dismissRepairNotice()"
						>
							Dismiss
						</button>
					</div>
				</div>
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowTopbarComponent {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly execution = inject(WorkflowExecutionService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly renameInput =
		viewChild<ElementRef<HTMLInputElement>>('renameInput');

	readonly isDropdownOpen = signal(false);
	readonly isRenaming = signal(false);
	readonly renameDraft = signal('');
	readonly showDeleteConfirm = signal(false);
	readonly repairNotice = signal<string | null>(null);

	constructor() {
		this.bridge.raw['workflow.load.repaired']
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((payload) => {
				this.repairNotice.set(payload.message);
				this.showDeleteConfirm.set(false);
				this.isDropdownOpen.set(false);
			});
	}

	private readonly topbarState = toSignal(
		merge(
			this.bridge.cached['workflow.list.snapshot'].pipe(
				map((payload) => ({
					kind: 'list' as const,
					workflows: payload.workflows,
				})),
			),
			this.bridge.cached['workflow.current.snapshot'].pipe(
				map((snapshot) => ({
					kind: 'current' as const,
					snapshot,
				})),
			),
			this.bridge.cached['workflow.currentStatus.snapshot'].pipe(
				map((payload) => ({
					kind: 'status' as const,
					status: payload.status,
				})),
			),
		).pipe(
			scan((state, event) => {
				switch (event.kind) {
					case 'list':
						return workflowTopbarWithList(state, event.workflows);
					case 'current':
						return workflowTopbarWithCurrentSnapshot(
							state,
							event.snapshot,
						);
					case 'status':
						return workflowTopbarWithCurrentStatus(
							state,
							event.status,
						);
					default:
						return state;
				}
			}, initialWorkflowTopbarState),
			startWith(initialWorkflowTopbarState),
		),
		{ initialValue: initialWorkflowTopbarState },
	);

	readonly workflows = computed(() => this.topbarState().workflows);
	readonly activeWorkflowName = computed(
		() => this.topbarState().activeWorkflow?.metadata.name ?? null,
	);
	readonly activeWorkflowId = computed(
		() => this.topbarState().activeWorkflow?.workflowId ?? null,
	);
	readonly isDirty = computed(
		() => this.topbarState().currentStatus === 'dirty',
	);
	readonly isRunning = this.execution.isRunning;
	readonly canSave = computed(
		() =>
			this.topbarState().activeWorkflow !== null &&
			this.topbarState().currentStatus === 'dirty',
	);
	readonly canRename = computed(
		() => this.activeWorkflowName() !== null && !this.isRunning(),
	);
	readonly canDelete = computed(
		() => this.topbarState().activeWorkflow !== null && !this.isRunning(),
	);
	readonly renameTip = computed(() =>
		workflowChangeControlTip(
			this.isRunning(),
			this.activeWorkflowName() === null
				? 'Load or create a workflow first'
				: 'Rename workflow',
		),
	);
	readonly deleteTip = computed(() =>
		workflowChangeControlTip(
			this.isRunning(),
			this.topbarState().activeWorkflow === null
				? 'No workflow loaded'
				: 'Delete this workflow from disk',
		),
	);
	readonly copyTip = computed(() =>
		workflowChangeControlTip(this.isRunning(), 'Copy this workflow'),
	);
	readonly createTip = computed(() =>
		workflowChangeControlTip(this.isRunning(), 'Create a new workflow'),
	);
	readonly loadTip = computed(() =>
		workflowChangeControlTip(this.isRunning(), 'Load this workflow'),
	);

	readonly saveTip = computed(() => {
		if (this.topbarState().activeWorkflow === null) {
			return 'Load or create a workflow first';
		}
		if (!this.canSave()) {
			return 'No unsaved changes';
		}
		return 'Save the active workflow';
	});

	toggleDropdown(): void {
		this.isDropdownOpen.update((open) => !open);
		this.showDeleteConfirm.set(false);
	}

	loadWorkflow(workflowId: string): void {
		if (this.isRunning()) {
			return;
		}
		this.bridge.raw['workflow.load.requested'].next({ workflowId });
		this.isDropdownOpen.set(false);
	}

	createWorkflow(): void {
		if (this.isRunning()) {
			return;
		}
		this.bridge.raw['workflow.create.requested'].next({});
		this.isDropdownOpen.set(false);
		this.showDeleteConfirm.set(false);
	}

	copyWorkflow(workflowId: string, event: Event): void {
		event.stopPropagation();
		if (this.isRunning()) {
			return;
		}
		this.bridge.raw['workflow.copy.requested'].next({ workflowId });
		this.isDropdownOpen.set(false);
		this.showDeleteConfirm.set(false);
	}

	saveCurrent(): void {
		this.bridge.raw['workflow.saveCurrent.requested'].next({});
		this.showDeleteConfirm.set(false);
	}

	startRename(): void {
		if (!this.canRename()) {
			return;
		}
		const name = this.activeWorkflowName();

		if (name === null) {
			return;
		}

		this.renameDraft.set(name);
		this.isRenaming.set(true);
		this.isDropdownOpen.set(false);
		this.showDeleteConfirm.set(false);

		queueMicrotask(() => {
			const input = this.renameInput()?.nativeElement;

			if (input !== undefined) {
				input.focus();
				input.select();
			}
		});
	}

	commitRename(): void {
		if (!this.isRenaming()) {
			return;
		}

		const nextName = this.renameDraft().trim();
		const currentName = this.activeWorkflowName();

		this.isRenaming.set(false);

		if (this.isRunning()) {
			return;
		}

		if (
			nextName.length === 0 ||
			currentName === null ||
			nextName === currentName
		) {
			return;
		}

		this.bridge.raw['workflow.renameCurrent.requested'].next({
			name: nextName,
		});
	}

	cancelRename(): void {
		this.isRenaming.set(false);
	}

	requestDelete(): void {
		if (!this.canDelete()) {
			return;
		}

		this.showDeleteConfirm.set(true);
		this.isDropdownOpen.set(false);
	}

	cancelDelete(): void {
		this.showDeleteConfirm.set(false);
	}

	dismissRepairNotice(): void {
		this.repairNotice.set(null);
	}

	confirmDelete(): void {
		if (this.isRunning()) {
			this.showDeleteConfirm.set(false);
			return;
		}
		const workflowId = this.activeWorkflowId();

		if (workflowId === null) {
			return;
		}

		this.bridge.raw['workflow.delete.requested'].next({ workflowId });
		this.showDeleteConfirm.set(false);
	}

	@HostListener('document:keydown.escape')
	protected handleEscape(): void {
		this.isDropdownOpen.set(false);
		this.showDeleteConfirm.set(false);
		this.repairNotice.set(null);
		this.cancelRename();
	}
}
