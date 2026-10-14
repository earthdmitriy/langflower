import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type {
	AskUserQuestion,
	RunnerAskUserAskPayload,
	RunnerPermissionAskPayload,
} from '@langflower/shared/types/langflower-config';
import {
	formatAskUserReplyText,
	hasAskUserReplyContent,
} from '@langflower/shared/langflower-config/format-ask-user-reply-text';
import { LfAskUserQuestionsComponent } from './lf-ask-user-questions.component';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { NodeHoverService } from '../../../services/node-hover.service';
import type { HitlControlProjection } from '../../../services/hitl-projection';
import {
	ASK_USER_COMPOSER_PORT_ID,
	ASK_USER_TEXTAREA_CONFIG,
	ComposerService,
} from '../composer.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { resolveComposerEnterPayload } from '../hitl-action-payload';
import { showSessionConversationReset } from '../composer-awaiting-node-ids';
import { resolveComposerFooterMode } from '../composer-footer-mode';
import { LfHitlActionsComponent } from './lf-hitl-actions.component';
import { LfHitlTextareaComponent } from './lf-hitl-textarea.component';
import { ContinueButtonComponent } from './continue-button.component';
import { PauseButtonComponent } from './pause-button.component';
import { RunButtonComponent } from './run-button.component';

/**
 * Composer shell. One surface: textarea fills the
 * shell; tab strip and footer float over it (absolute + fade). Stop left,
 * Start/Run/Send right; Pause is per-node (last feed section) and may show
 * again in HITL footer when another agent becomes last in feed. Enter (no
 * Shift) activates the rightmost footer CTA; an empty Steer draft Continues
 * instead of Send. Shift+Enter inserts a newline.
 */
@Component({
	selector: 'lf-composer-shell',
	standalone: true,
	imports: [
		RunButtonComponent,
		PauseButtonComponent,
		ContinueButtonComponent,
		LfHitlTextareaComponent,
		LfHitlActionsComponent,
		LfHoverTipComponent,
		LfAskUserQuestionsComponent,
	],
	host: {
		class: 'block shrink-0',
	},
	template: `
		<section
			class="relative overflow-hidden border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
			[style.height.px]="height()"
		>
			@if (activePermissionAsk(); as ask) {
				<div
					class="lf-scroll absolute inset-0 z-0 flex flex-col gap-2 overflow-y-auto p-4 pb-14"
				>
					<p
						class="text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300"
					>
						permission.ask
					</p>
					<p
						class="text-sm leading-5 text-zinc-800 dark:text-zinc-100"
					>
						{{ ask.summary }}
					</p>
					<p
						class="text-[11px] leading-4 text-zinc-500 dark:text-zinc-400"
					>
						{{ permissionAskMeta(ask) }}
					</p>
				</div>
			} @else if (activeAskUser(); as ask) {
				<div class="absolute inset-0 z-0 flex min-h-0 flex-col pb-14">
					@if (askUserQuestions(ask).length > 0) {
						<lf-ask-user-questions
							class="lf-scroll min-h-0 max-h-[55%] shrink-0 overflow-y-auto border-b border-zinc-200 px-3 py-2 dark:border-zinc-800"
							[askId]="ask.askId"
							[headline]="ask.question"
							[questions]="askUserQuestions(ask)"
							(selectionsChange)="onAskUserSelections($event)"
						/>
					}
					<lf-hitl-textarea
						class="min-h-0 flex-1"
						[nodeId]="ask.nodeId"
						[portId]="askUserPortId"
						[config]="askUserTextareaConfig"
						(enterActivate)="onEnterActivate()"
					/>
				</div>
			} @else if (hitlTabs().length === 0) {
				@if (footerMode() !== 'working') {
					<p
						class="absolute inset-0 z-0 p-4 pb-14 text-[11px] leading-4 text-zinc-400 dark:text-zinc-500"
					>
						No pending human-in-the-loop steps. Chat Input and
						Review Gate replies appear here when the graph is
						waiting on you.
					</p>
				}
			} @else {
				@if (showTabs()) {
					<div
						class="lf-scroll absolute inset-x-0 top-0 z-[3] flex items-center gap-1 overflow-x-auto bg-gradient-to-b from-white from-40% to-transparent px-2 py-1.5 dark:from-zinc-900"
					>
						@for (tab of hitlTabs(); track tab.nodeId) {
							<button
								type="button"
								class="rounded-md px-2.5 py-1 text-[11px] font-medium transition"
								[class.bg-zinc-900]="
									tab.nodeId === resolvedActiveHitlTab()
								"
								[class.text-white]="
									tab.nodeId === resolvedActiveHitlTab()
								"
								[class.text-zinc-600]="
									tab.nodeId !== resolvedActiveHitlTab()
								"
								[class.hover:bg-zinc-100]="
									tab.nodeId !== resolvedActiveHitlTab()
								"
								[class.ring-2]="hover.isHovered(tab.nodeId)"
								[class.ring-violet-400]="
									hover.isHovered(tab.nodeId)
								"
								[class.dark:text-zinc-300]="
									tab.nodeId !== resolvedActiveHitlTab()
								"
								[class.dark:hover:bg-zinc-800]="
									tab.nodeId !== resolvedActiveHitlTab()
								"
								(click)="selectHitlTab(tab.nodeId)"
								(mouseenter)="hover.set(tab.nodeId)"
								(mouseleave)="hover.clear()"
							>
								{{ tab.label }}
							</button>
						}
					</div>
				}
				@if (activeHitlTextarea(); as ta) {
					<lf-hitl-textarea
						class="absolute inset-0 z-0"
						[nodeId]="ta.nodeId"
						[portId]="ta.portId"
						[config]="ta.config"
						[padTopForTabs]="showTabs()"
						(enterActivate)="onEnterActivate()"
					/>
				}
			}

			@if (footerMode() === 'working') {
				<p
					class="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-3 text-xs font-medium tracking-wide text-zinc-500 dark:text-zinc-400"
				>
					working . . .
				</p>
			}

			<!-- Footer floats over the stage — not a reserved band. -->
			<div
				class="absolute inset-x-0 bottom-0 z-[3] flex min-h-[calc(var(--lf-control-h)+1.1rem)] items-center bg-gradient-to-t from-white from-45% to-transparent px-3 py-2 dark:from-zinc-900"
			>
				@switch (footerMode()) {
					@case ('permission') {
						@if (activePermissionAsk(); as ask) {
							<div
								class="flex w-full items-center justify-end gap-2"
							>
								<lf-hover-tip
									tip="Deny this tool permission ask"
								>
									<button
										type="button"
										class="lf-composer-pill border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
										(click)="onPermissionReply(ask, 'deny')"
									>
										Deny
									</button>
								</lf-hover-tip>
								<lf-hover-tip
									tip="Allow this tool permission ask"
								>
									<button
										type="button"
										class="lf-composer-pill border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
										(click)="
											onPermissionReply(ask, 'allow')
										"
									>
										Allow
									</button>
								</lf-hover-tip>
							</div>
						}
					}
					@case ('askUser') {
						@if (activeAskUser(); as ask) {
							<div
								class="flex w-full items-center justify-between gap-3"
							>
								@if (execution.isRunning()) {
									<lf-run-button [compact]="true" />
								}
								<lf-hover-tip
									[tip]="
										canSubmitAskUser(ask)
											? 'Send this answer to the agent'
											: 'Select an option or type a message'
									"
								>
									<button
										type="button"
										class="lf-composer-pill ml-auto border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
										[disabled]="!canSubmitAskUser(ask)"
										(click)="onAskUserSubmit(ask)"
									>
										Send
									</button>
								</lf-hover-tip>
							</div>
						}
					}
					@case ('working') {
						<div
							class="flex w-full items-center justify-between gap-3"
						>
							<lf-run-button [compact]="true" />
							<lf-pause-button />
						</div>
					}
					@case ('hitl') {
						<div class="flex w-full items-center gap-2">
							@if (execution.isRunning()) {
								<div
									class="mr-auto flex shrink-0 items-center gap-2"
								>
									<lf-run-button [compact]="true" />
									<lf-pause-button />
								</div>
							} @else if (showConversationReset()) {
								<div class="mr-auto flex shrink-0 items-center">
									<lf-hover-tip
										align="start"
										side="top"
										tip="Clear this session's conversation. The graph stays."
									>
										<button
											type="button"
											class="lf-composer-icon-btn border border-zinc-300 text-zinc-500 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-100"
											aria-label="Reset session"
											(click)="requestReset()"
										>
											<svg
												viewBox="0 0 20 20"
												class="h-4 w-4"
												fill="none"
												stroke="currentColor"
												stroke-width="1.5"
												aria-hidden="true"
											>
												<path
													d="M4.5 10a5.5 5.5 0 0 1 9.4-3.9L16 8"
												/>
												<path d="M16 4.5V8h-3.5" />
												<path
													d="M15.5 10a5.5 5.5 0 0 1-9.4 3.9L4 12"
												/>
												<path d="M4 15.5V12h3.5" />
											</svg>
										</button>
									</lf-hover-tip>
								</div>
							}
							<div
								class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2"
							>
								<lf-continue-button [compact]="true" />
								@if (
									hitlReplyActionsForActiveTab().length > 0
								) {
									<lf-hitl-actions
										class="flex items-center gap-2"
										[entries]="
											hitlReplyActionsForActiveTab()
										"
										(submitted)="onHitlSubmit($event)"
									/>
								}
								@if (
									!execution.isRunning() &&
									hitlStartActionForActiveTab().length > 0
								) {
									<lf-hitl-actions
										class="flex items-center"
										[entries]="
											hitlStartActionForActiveTab()
										"
										(submitted)="onHitlSubmit($event)"
									/>
								}
							</div>
						</div>
					}
					@default {
						<div class="flex w-full flex-col items-stretch gap-2">
							<lf-continue-button />
							<lf-run-button class="w-full" />
						</div>
					}
				}
			</div>
			@if (pendingReset()) {
				<div
					class="absolute bottom-16 left-3 z-20 w-72 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
					role="alertdialog"
					aria-labelledby="reset-session-title"
					aria-describedby="reset-session-desc"
				>
					<h2
						id="reset-session-title"
						class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
					>
						Reset session?
					</h2>
					<p
						id="reset-session-desc"
						class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
					>
						This clears the conversation, the work log, and points.
						The graph stays.
					</p>
					<div class="mt-4 flex justify-end gap-2">
						<button
							type="button"
							class="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
							(click)="cancelReset()"
						>
							Cancel
						</button>
						<button
							type="button"
							class="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
							(click)="confirmReset()"
						>
							Reset
						</button>
					</div>
				</div>
			}
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfComposerShellComponent {
	readonly height = input.required<number>();

	private readonly bridge = inject(LangflowerBridgeService);
	readonly execution = inject(WorkflowExecutionService);
	readonly composer = inject(ComposerService);
	readonly hover = inject(NodeHoverService);

	private readonly boundSessionId = toSignal(
		this.bridge.cached['workflowSession.current.snapshot'].pipe(
			map((snapshot) => snapshot.sessionId),
		),
		{ initialValue: null as string | null },
	);

	readonly pendingReset = signal(false);

	readonly showConversationReset = computed(() =>
		showSessionConversationReset(
			this.execution.isRunning(),
			this.composer.hasAwaitingHitl() ? 1 : 0,
		),
	);

	readonly activePermissionAsk = computed(
		() => this.composer.pendingPermissionAsks()[0] ?? null,
	);

	readonly activeAskUser = computed(
		() => this.composer.pendingAskUserAsks()[0] ?? null,
	);

	readonly askUserPortId = ASK_USER_COMPOSER_PORT_ID;
	readonly askUserTextareaConfig = ASK_USER_TEXTAREA_CONFIG;
	readonly askUserSelections = signal<ReadonlyMap<string, readonly string[]>>(
		new Map(),
	);

	readonly hitlTabs = computed<
		ReadonlyArray<{
			readonly nodeId: string;
			readonly label: string;
			readonly textarea: HitlControlProjection | null;
			readonly actions: readonly HitlControlProjection[];
		}>
	>(() =>
		this.composer.hitlTriggeredNodeIds().map((nodeId) => {
			const controls = this.composer.hitlControls(nodeId);
			return {
				nodeId,
				label: this.execution.nodeLabel(nodeId),
				textarea:
					controls.find(
						(control) => control.config.kind === 'textarea',
					) ?? null,
				actions: controls,
			};
		}),
	);

	private readonly selectedHitlTab = signal<string | null>(null);

	readonly resolvedActiveHitlTab = computed(() => {
		const tabs = this.hitlTabs();
		if (tabs.length === 0) {
			return null;
		}
		const selected = this.selectedHitlTab();
		if (selected !== null && tabs.some((tab) => tab.nodeId === selected)) {
			return selected;
		}
		return tabs[0]?.nodeId ?? null;
	});

	readonly activeHitlTabEntry = computed(() => {
		const active = this.resolvedActiveHitlTab();
		if (active === null) {
			return null;
		}
		return this.hitlTabs().find((tab) => tab.nodeId === active) ?? null;
	});

	readonly activeHitlTextarea = computed(
		() => this.activeHitlTabEntry()?.textarea ?? null,
	);

	readonly hitlReplyActionsForActiveTab = computed(() =>
		(this.activeHitlTabEntry()?.actions ?? []).filter(
			(entry) =>
				!(
					entry.config.kind === 'textarea' &&
					entry.config.role === 'chat-start'
				),
		),
	);

	readonly hitlStartActionForActiveTab = computed(() =>
		(this.activeHitlTabEntry()?.actions ?? []).filter(
			(entry) =>
				entry.config.kind === 'textarea' &&
				entry.config.role === 'chat-start',
		),
	);

	readonly showTabs = computed(() => this.hitlTabs().length > 1);

	readonly footerMode = computed(() =>
		resolveComposerFooterMode({
			hasPermissionAsk: this.activePermissionAsk() !== null,
			hasAskUser: this.activeAskUser() !== null,
			isRunning: this.execution.isRunning(),
			hitlTabCount: this.hitlTabs().length,
		}),
	);

	selectHitlTab(nodeId: string): void {
		this.selectedHitlTab.set(nodeId);
	}

	requestReset(): void {
		if (!this.showConversationReset()) {
			return;
		}
		this.pendingReset.set(true);
	}

	cancelReset(): void {
		this.pendingReset.set(false);
	}

	confirmReset(): void {
		const sessionId = this.boundSessionId();
		this.pendingReset.set(false);
		if (sessionId === null) {
			return;
		}
		this.bridge.raw['workflowSession.resetConversation.requested'].next({
			sessionId,
		});
	}

	onHitlSubmit(
		event: readonly [nodeId: string, portId: string, payload: unknown],
	): void {
		this.composer.submitHitl(event);
	}

	/** Enter in the focused textarea → same as clicking the rightmost CTA. */
	onEnterActivate(): void {
		const ask = this.activeAskUser();
		if (this.footerMode() === 'askUser' && ask !== null) {
			this.onAskUserSubmit(ask);
			return;
		}
		const entries = [
			...this.hitlReplyActionsForActiveTab(),
			...(this.execution.isRunning()
				? []
				: this.hitlStartActionForActiveTab()),
		];
		const rightmost = entries.at(-1) ?? null;
		if (rightmost === null) {
			return;
		}
		const draft = this.composer.composerText(
			rightmost.nodeId,
			rightmost.portId,
		);
		const resolved = resolveComposerEnterPayload(rightmost, draft);
		if (!resolved.ok) {
			return;
		}
		this.onHitlSubmit([
			rightmost.nodeId,
			rightmost.portId,
			resolved.payload,
		]);
	}

	onPermissionReply(
		ask: RunnerPermissionAskPayload,
		decision: 'allow' | 'deny',
	): void {
		this.composer.submitPermissionReply(ask, decision);
	}

	askUserDraft(ask: RunnerAskUserAskPayload): string {
		return this.composer.composerText(
			ask.nodeId,
			ASK_USER_COMPOSER_PORT_ID,
		);
	}

	askUserQuestions(ask: RunnerAskUserAskPayload): readonly AskUserQuestion[] {
		return ask.questions ?? [];
	}

	canSubmitAskUser(ask: RunnerAskUserAskPayload): boolean {
		return hasAskUserReplyContent(
			this.askUserDraft(ask),
			this.askUserSelections(),
		);
	}

	onAskUserSelections(next: ReadonlyMap<string, readonly string[]>): void {
		this.askUserSelections.set(next);
	}

	onAskUserSubmit(ask: RunnerAskUserAskPayload): void {
		const text = formatAskUserReplyText({
			questions: this.askUserQuestions(ask),
			selections: this.askUserSelections(),
			freeform: this.askUserDraft(ask),
		});
		this.composer.submitAskUserReply(ask, text);
		this.askUserSelections.set(new Map());
	}

	permissionAskMeta(ask: RunnerPermissionAskPayload): string {
		const base = `${this.execution.nodeLabel(ask.nodeId)} · ${ask.toolId}`;
		return ask.detail.length > 0 ? `${base} · ${ask.detail}` : base;
	}
}
