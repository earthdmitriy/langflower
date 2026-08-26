import {
	ChangeDetectionStrategy,
	Component,
	Input,
	computed,
	inject,
	signal,
} from '@angular/core';
import type { RunnerPermissionAskPayload } from '@langflower/shared/langflower';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { NodeHoverService } from '../../../services/node-hover.service';
import type { HitlControlProjection } from '../../../services/hitl-projection';
import { ComposerService } from '../composer.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { resolveComposerActionPayload } from '../hitl-action-payload';
import { resolveComposerFooterMode } from '../composer-footer-mode';
import { LfHitlActionsComponent } from './lf-hitl-actions.component';
import { LfHitlTextareaComponent } from './lf-hitl-textarea.component';
import { ContinueButtonComponent } from './continue-button.component';
import { PauseButtonComponent } from './pause-button.component';
import { RunButtonComponent } from './run-button.component';

/**
 * Composer shell — palette §8 / epic 35. One surface: textarea fills the
 * shell; tab strip and footer float over it (absolute + fade). Stop left,
 * Start/Run/Send right; Pause is per-node (last feed section) and may show
 * again in HITL footer when another agent becomes last in feed. Enter (no
 * Shift) activates the rightmost footer CTA; Shift+Enter inserts a newline.
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
	],
	host: {
		class: 'block shrink-0',
	},
	template: `
		<section
			class="relative overflow-hidden border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
			[style.height.px]="height"
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

			<!-- Footer floats over the stage (palette §8) — not a reserved band. -->
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
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfComposerShellComponent {
	/** Full shell height from editor divider fold (stage + overlay footer). */
	@Input({ required: true }) height!: number;

	readonly execution = inject(WorkflowExecutionService);
	readonly composer = inject(ComposerService);
	readonly hover = inject(NodeHoverService);

	readonly activePermissionAsk = computed(
		() => this.composer.pendingPermissionAsks()[0] ?? null,
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
			isRunning: this.execution.isRunning(),
			hitlTabCount: this.hitlTabs().length,
		}),
	);

	selectHitlTab(nodeId: string): void {
		this.selectedHitlTab.set(nodeId);
	}

	onHitlSubmit(
		event: readonly [nodeId: string, portId: string, payload: unknown],
	): void {
		this.composer.submitHitl(event);
	}

	/** Enter in the focused textarea → same as clicking the rightmost CTA. */
	onEnterActivate(): void {
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
		const resolved = resolveComposerActionPayload(rightmost, draft);
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

	permissionAskMeta(ask: RunnerPermissionAskPayload): string {
		const base = `${this.execution.nodeLabel(ask.nodeId)} · ${ask.toolId}`;
		return ask.detail.length > 0 ? `${base} · ${ask.detail}` : base;
	}
}
