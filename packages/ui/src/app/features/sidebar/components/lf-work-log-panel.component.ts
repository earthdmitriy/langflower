import { AsyncPipe } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	inject,
	signal,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatPortValue } from '../format-port-value.js';
import { renderMarkdown } from '../../../utils/render-markdown.js';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { ExecutionFeedService } from '../../feed-folding/execution-feed.service.js';
import type { PortStreamItem } from '../../feed-folding/types.js';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service.js';
import { NodeHoverService } from '../../../services/node-hover.service.js';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service.js';

const itemText = (item: PortStreamItem): string => formatPortValue(item.value);

const presentationLabel = (item: PortStreamItem): string => {
	switch (item.meta.presentation) {
		case 'reasoning':
			return 'Reasoning';
		case 'draft':
			return 'Draft';
		case 'tool':
		case 'tool-request':
		case 'tool-response':
			return 'Tool';
		case 'shell':
			return 'Shell';
		case 'result':
			return 'Response';
		case 'recovery':
			return 'Recovery';
		case 'error':
			return 'Error';
		case 'permission-ask':
			return 'Permission';
		case 'permission-grant':
			return 'Permission allowed';
		case 'permission-deny':
			return 'Permission denied';
		case 'hitl-user':
			return 'User';
		case 'steering-pause':
			return 'Paused';
		case 'steering-resume':
			return 'Resumed';
		default:
			return 'Data';
	}
};

@Component({
	selector: 'lf-work-log-panel',
	standalone: true,
	imports: [AsyncPipe, LfHoverTipComponent],
	host: { class: 'block h-full' },
	template: `
		<div class="flex h-full min-h-0 flex-col">
			<div class="mb-2 flex shrink-0 items-center justify-between gap-2">
				<span
					class="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200"
					>Work log</span
				>
				@if (!execution.isRunning()) {
					<lf-hover-tip
						side="left"
						align="center"
						tip="Clear the work log"
					>
						<button
							type="button"
							class="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
							(click)="clearFeed()"
						>
							Clear
						</button>
					</lf-hover-tip>
				}
			</div>

			@if (feed.nodeFeed$ | async; as visits) {
				@if (visits.length === 0) {
					<p
						class="text-xs leading-5 text-zinc-500 dark:text-zinc-400"
					>
						Run the workflow to see execution progress here.
					</p>
				} @else {
					<div class="relative min-h-0 flex-1">
						<div
							#scrollRef
							class="lf-scroll h-full overflow-y-auto"
							(scroll)="onScroll()"
						>
							@for (visit of visits; track visit.visitId) {
								<section
									class="flex min-w-0 flex-col gap-1 px-2 py-1.5"
									[class.lf-feed-row--hovered]="
										hover.isHovered(visit.nodeId)
									"
									(mouseenter)="hover.set(visit.nodeId)"
									(mouseleave)="hover.clear()"
								>
									<header
										class="text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
									>
										{{ execution.nodeLabel(visit.nodeId) }}
										@if (
											!visit.isClosed &&
											execution.isRunning()
										) {
											<span
												class="ml-1 text-[9px] text-amber-600 dark:text-amber-400"
												>working…</span
											>
										}
									</header>

									@if (
										visit.foldedEventsFromPorts | async;
										as ports
									) {
										@for (
											port of ports;
											track port.segmentId;
											let isLastSegment = $last
										) {
											@if (
												port.stream | async;
												as items
											) {
												@for (
													item of items;
													track item.seq
												) {
													@switch (
														item.meta.presentation
													) {
														@case ('hitl-user') {
															<div
																class="flex justify-end"
															>
																<pre
																	class="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md border border-zinc-300 bg-zinc-200 px-3 py-1.5 font-sans text-[12px] leading-5 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
																	>{{
																		itemText(
																			item
																		)
																	}}</pre>
															</div>
														}
														@case ('result') {
															<div
																class="flex justify-start"
															>
																<div
																	class="lf-feed-md max-w-[92%] rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-3 py-2 text-[12px] leading-5 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
																	[innerHTML]="
																		markdownHtml(
																			itemText(
																				item
																			)
																		)
																	"
																></div>
															</div>
														}
														@case ('permission-ask') {
															<p
																class="text-[11px] text-amber-700 dark:text-amber-300"
															>
																Permission:
																{{
																	itemText(
																		item
																	)
																}}
															</p>
														}
														@case ('permission-grant') {
															<p
																class="text-[11px] text-amber-700 dark:text-amber-300"
															>
																Permission
																allowed:
																{{
																	itemText(
																		item
																	)
																}}
															</p>
														}
														@case ('permission-deny') {
															<p
																class="text-[11px] text-amber-700 dark:text-amber-300"
															>
																Permission
																denied:
																{{
																	itemText(
																		item
																	)
																}}
															</p>
														}
														@case ('recovery') {
															<pre
																class="whitespace-pre-wrap break-words rounded-md border border-amber-300/80 bg-amber-50 px-2 py-1.5 font-sans text-[11px] text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
																>{{
																	itemText(
																		item
																	)
																}}</pre>
														}
														@case ('tool') {
															<details
																class="min-w-0 border-0 bg-transparent text-[11px] text-zinc-500 dark:text-zinc-400"
															>
																<summary
																	class="cursor-pointer select-none list-none text-zinc-400 dark:text-zinc-500 [&::-webkit-details-marker]:hidden"
																>
																	{{
																		presentationLabel(
																			item
																		)
																	}}
																</summary>
																<pre
																	class="mt-0.5 whitespace-pre-wrap break-words font-sans"
																	>{{
																		itemText(
																			item
																		)
																	}}</pre>
															</details>
														}
														@case ('tool-request') {
															<details
																class="min-w-0 border-0 bg-transparent text-[11px] text-zinc-500 dark:text-zinc-400"
															>
																<summary
																	class="cursor-pointer select-none list-none text-zinc-400 dark:text-zinc-500 [&::-webkit-details-marker]:hidden"
																>
																	{{
																		presentationLabel(
																			item
																		)
																	}}
																</summary>
																<pre
																	class="mt-0.5 whitespace-pre-wrap break-words font-sans"
																	>{{
																		itemText(
																			item
																		)
																	}}</pre>
															</details>
														}
														@case ('tool-response') {
															<details
																class="min-w-0 border-0 bg-transparent text-[11px] text-zinc-500 dark:text-zinc-400"
															>
																<summary
																	class="cursor-pointer select-none list-none text-zinc-400 dark:text-zinc-500 [&::-webkit-details-marker]:hidden"
																>
																	{{
																		presentationLabel(
																			item
																		)
																	}}
																</summary>
																<pre
																	class="mt-0.5 whitespace-pre-wrap break-words font-sans"
																	>{{
																		itemText(
																			item
																		)
																	}}</pre>
															</details>
														}
														@case ('shell') {
															<details
																class="min-w-0 border-0 bg-transparent text-[11px] text-zinc-500 dark:text-zinc-400"
															>
																<summary
																	class="cursor-pointer select-none list-none text-zinc-400 dark:text-zinc-500 [&::-webkit-details-marker]:hidden"
																>
																	{{
																		presentationLabel(
																			item
																		)
																	}}
																</summary>
																<pre
																	class="mt-0.5 whitespace-pre-wrap break-words font-sans"
																	>{{
																		itemText(
																			item
																		)
																	}}</pre>
															</details>
														}
														@case ('draft') {
															@if (
																!(
																	visit.hasResult &&
																	port.segmentId ===
																		visit.lastDraftSegmentId
																)
															) {
																<div
																	class="flex w-full flex-col gap-0.5"
																>
																	<div
																		class="flex min-w-0 items-baseline gap-1 text-[9px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
																	>
																		<span
																			>draft</span
																		>
																		@if (
																			!visit.isClosed &&
																			isLastSegment
																		) {
																			<span
																				class="normal-case tracking-normal text-amber-600 dark:text-amber-400"
																				>streaming…</span
																			>
																		}
																	</div>
																	<div
																		class="flex justify-start"
																	>
																		<div
																			class="lf-feed-md max-w-[92%] rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-3 py-2 text-[12px] leading-5 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
																			[innerHTML]="
																				markdownHtml(
																					itemText(
																						item
																					)
																				)
																			"
																		></div>
																	</div>
																</div>
															}
														}
														@case ('reasoning') {
															@if (
																!visit.isClosed &&
																isLastSegment
															) {
																<div
																	class="flex min-w-0 flex-col gap-0.5"
																>
																	<div
																		class="flex min-w-0 items-baseline gap-1 text-[9px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
																	>
																		<span
																			>Reasoning</span
																		>
																		<span
																			class="normal-case tracking-normal text-amber-600 dark:text-amber-400"
																			>streaming…</span
																		>
																	</div>
																	<div
																		class="h-[2lh] min-w-0 w-full overflow-hidden text-[11px] leading-4 text-zinc-600 dark:text-zinc-300"
																	>
																		<div
																			class="flex h-full min-h-0 flex-col justify-end"
																		>
																			<pre
																				class="whitespace-pre-wrap break-words font-sans"
																				>{{
																					itemText(
																						item
																					)
																				}}</pre>
																		</div>
																	</div>
																</div>
															} @else {
																<details
																	class="min-w-0 text-[11px] text-zinc-500 dark:text-zinc-400"
																>
																	<summary
																		class="cursor-pointer select-none list-none truncate text-zinc-600 dark:text-zinc-300 [&::-webkit-details-marker]:hidden"
																	>
																		Reasoning:
																		{{
																			itemText(
																				item
																			)
																		}}
																	</summary>
																	<pre
																		class="mt-1 whitespace-pre-wrap break-words font-sans"
																		>{{
																			itemText(
																				item
																			)
																		}}</pre>
																</details>
															}
														}
														@default {
															<details
																class="min-w-0 text-[11px] text-zinc-500 dark:text-zinc-400"
															>
																<summary
																	class="cursor-pointer select-none list-none truncate [&::-webkit-details-marker]:hidden"
																>
																	{{
																		item
																			.meta
																			.presentation ===
																		'data'
																			? port.portId
																			: presentationLabel(
																					item
																				)
																	}}
																</summary>
																<pre
																	class="mt-1 whitespace-pre-wrap break-words font-sans"
																	>{{
																		itemText(
																			item
																		)
																	}}</pre>
															</details>
														}
													}
												}
											}
										}
									}
								</section>
							}
						</div>

						@if (!autoScroll()) {
							<lf-hover-tip
								class="absolute bottom-2 right-3"
								tip="Jump to the latest events"
							>
								<button
									type="button"
									class="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
									(click)="scrollToBottom()"
								>
									↓ New events
								</button>
							</lf-hover-tip>
						}
					</div>
				}
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfWorkLogPanelComponent {
	readonly feed = inject(ExecutionFeedService);
	readonly execution = inject(WorkflowExecutionService);
	private readonly bridge = inject(LangflowerBridgeService);
	readonly hover = inject(NodeHoverService);
	private readonly destroyRef = inject(DestroyRef);

	readonly autoScroll = signal(true);
	readonly itemText = itemText;
	readonly presentationLabel = presentationLabel;

	private readonly scrollRef =
		viewChild<ElementRef<HTMLDivElement>>('scrollRef');

	constructor() {
		this.feed.nodeFeed$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => {
				if (!this.autoScroll()) {
					return;
				}
				setTimeout(() => {
					const el = this.scrollRef()?.nativeElement;
					if (el !== undefined) {
						el.scrollTop = el.scrollHeight;
					}
				});
			});
	}

	markdownHtml(text: string): string {
		return renderMarkdown(text);
	}

	clearFeed(): void {
		this.bridge.raw['runner.executionFeed.clear.requested'].next({});
	}

	onScroll(): void {
		const el = this.scrollRef()?.nativeElement;
		if (el === undefined) {
			return;
		}
		const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
		this.autoScroll.set(distance <= 24);
	}

	scrollToBottom(): void {
		const el = this.scrollRef()?.nativeElement;
		if (el === undefined) {
			return;
		}
		el.scrollTop = el.scrollHeight;
		this.autoScroll.set(true);
	}
}
