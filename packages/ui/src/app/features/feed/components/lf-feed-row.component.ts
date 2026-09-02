import { NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	inject,
	input,
	output,
} from '@angular/core';
import { renderMarkdown } from '../../../utils/render-markdown.js';
import type { FeedItemRow, FeedRow } from '../../feed-folding/types.js';
import { NodeHoverService } from '../../../services/node-hover.service.js';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service.js';
import { feedDetailsOpenKey } from '../feed-details-open-key.js';
import {
	collapsedSummary,
	itemText,
	presentationLabel,
	recoveryBanner,
} from '../feed-item-presentation.js';
import { LfFeedCollapsibleComponent } from './lf-feed-collapsible.component.js';

@Component({
	selector: 'lf-feed-row',
	standalone: true,
	imports: [NgTemplateOutlet, LfFeedCollapsibleComponent],
	host: {
		class: 'block min-w-0 w-full max-w-full',
		'[class.lf-feed-row--hovered]': 'isHovered()',
		'[class.mt-2]': 'isLaterVisitHeader()',
		'[class.pb-2]': 'isLastInVisit()',
		'(mouseenter)': 'onRowEnter()',
		'(mouseleave)': 'onRowLeave()',
	},
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		@if (row(); as current) {
			@switch (current.kind) {
				@case ('header') {
					<header
						class="px-2 pt-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
					>
						{{ execution.nodeLabel(current.nodeId) }}
						@if (
							!current.isClosed &&
							!current.hasLiveRecovery &&
							execution.isRunning()
						) {
							<span
								class="ml-1 text-[9px] text-amber-600 dark:text-amber-400"
								>working…</span
							>
						}
					</header>
				}
				@case ('item') {
					<div class="min-w-0 w-full max-w-full px-2 pt-1">
						<ng-container
							[ngTemplateOutlet]="itemTpl"
							[ngTemplateOutletContext]="{ $implicit: current }"
						/>
					</div>
				}
			}
		}
		<ng-template #itemTpl let-current>
			@switch (itemOf(current).meta.presentation) {
				@case ('hitl-user') {
					<div class="flex min-w-0 justify-end">
						<pre
							class="max-w-[92%] min-w-0 whitespace-pre-wrap break-words rounded-2xl rounded-tr-md border border-zinc-300 bg-zinc-200 px-3 py-1.5 font-sans text-[12px] leading-5 text-zinc-900 wrap-anywhere dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
							>{{ itemText(itemOf(current)) }}</pre>
					</div>
				}
				@case ('result') {
					<div class="flex min-w-0 justify-start">
						<div
							class="lf-feed-md max-w-[92%] min-w-0 rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-3 py-2 text-[12px] leading-5 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
							[innerHTML]="
								markdownHtml(itemText(itemOf(current)))
							"
						></div>
					</div>
				}
				@case ('permission-ask') {
					<p class="text-[11px] text-amber-700 dark:text-amber-300">
						Permission:
						{{ itemText(itemOf(current)) }}
					</p>
				}
				@case ('permission-grant') {
					<p class="text-[11px] text-amber-700 dark:text-amber-300">
						Permission allowed:
						{{ itemText(itemOf(current)) }}
					</p>
				}
				@case ('permission-deny') {
					<p class="text-[11px] text-amber-700 dark:text-amber-300">
						Permission denied:
						{{ itemText(itemOf(current)) }}
					</p>
				}
				@case ('recovery') {
					<pre
						class="min-w-0 max-w-full whitespace-pre-wrap break-words rounded-md border border-amber-300/80 bg-amber-50 px-2 py-1.5 font-sans text-[11px] text-amber-900 wrap-anywhere dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100"
						>{{
							recoveryBanner(
								itemOf(current),
								execution.livenessNowMs(),
								!current.isClosed && current.isLiveRecovery
							)
						}}</pre>
				}
				@case ('tool') {
					<ng-container
						[ngTemplateOutlet]="collapsibleTpl"
						[ngTemplateOutletContext]="{
							$implicit: current,
							label: presentationLabel(itemOf(current)),
							detailsClass: 'border-0 bg-transparent',
							summaryClass: 'text-zinc-400 dark:text-zinc-500',
							bodyClass: 'mt-0.5',
						}"
					/>
				}
				@case ('tool-request') {
					<ng-container
						[ngTemplateOutlet]="collapsibleTpl"
						[ngTemplateOutletContext]="{
							$implicit: current,
							label: presentationLabel(itemOf(current)),
							detailsClass: 'border-0 bg-transparent',
							summaryClass: 'text-zinc-400 dark:text-zinc-500',
							bodyClass: 'mt-0.5',
						}"
					/>
				}
				@case ('tool-response') {
					<ng-container
						[ngTemplateOutlet]="collapsibleTpl"
						[ngTemplateOutletContext]="{
							$implicit: current,
							label: presentationLabel(itemOf(current)),
							detailsClass: 'border-0 bg-transparent',
							summaryClass: 'text-zinc-400 dark:text-zinc-500',
							bodyClass: 'mt-0.5',
						}"
					/>
				}
				@case ('shell') {
					<ng-container
						[ngTemplateOutlet]="collapsibleTpl"
						[ngTemplateOutletContext]="{
							$implicit: current,
							label: presentationLabel(itemOf(current)),
							detailsClass: 'border-0 bg-transparent',
							summaryClass: 'text-zinc-400 dark:text-zinc-500',
							bodyClass: 'mt-0.5',
						}"
					/>
				}
				@case ('draft') {
					<div class="flex w-full flex-col gap-0.5">
						<div
							class="flex min-w-0 items-baseline gap-1 text-[9px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
						>
							<span>draft</span>
							@if (!current.isClosed && current.isLastSegment) {
								<span
									class="normal-case tracking-normal text-amber-600 dark:text-amber-400"
									>streaming…</span
								>
							}
						</div>
						<div class="flex min-w-0 justify-start">
							<div
								class="lf-feed-md max-w-[92%] min-w-0 rounded-2xl rounded-tl-md border border-zinc-200 bg-white px-3 py-2 text-[12px] leading-5 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
								[innerHTML]="
									markdownHtml(itemText(itemOf(current)))
								"
							></div>
						</div>
					</div>
				}
				@case ('reasoning') {
					<ng-container
						[ngTemplateOutlet]="growingLogTpl"
						[ngTemplateOutletContext]="{ $implicit: current }"
					/>
				}
				@case ('progress') {
					<ng-container
						[ngTemplateOutlet]="growingLogTpl"
						[ngTemplateOutletContext]="{ $implicit: current }"
					/>
				}
				@default {
					<ng-container
						[ngTemplateOutlet]="collapsibleTpl"
						[ngTemplateOutletContext]="{
							$implicit: current,
							label:
								itemOf(current).meta.presentation === 'data'
									? current.portId
									: presentationLabel(itemOf(current)),
							detailsClass: '',
							summaryClass: '',
							bodyClass: 'mt-1',
						}"
					/>
				}
			}
		</ng-template>
		<ng-template
			#collapsibleTpl
			let-current
			let-label="label"
			let-detailsClass="detailsClass"
			let-summaryClass="summaryClass"
			let-bodyClass="bodyClass"
		>
			<lf-feed-collapsible
				[summary]="collapsedSummary(label, itemOf(current).value)"
				[value]="itemOf(current).value"
				[open]="isDetailsOpen(current)"
				(openChange)="onDetailsOpen(current, $event)"
				[detailsClass]="detailsClass"
				[summaryClass]="summaryClass"
				[bodyClass]="bodyClass"
			/>
		</ng-template>
		<ng-template #growingLogTpl let-current>
			@if (!current.isClosed && current.isLastSegment) {
				<div class="flex min-w-0 flex-col gap-0.5">
					<div
						class="flex min-w-0 items-baseline gap-1 text-[9px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
					>
						<span>{{ presentationLabel(itemOf(current)) }}</span>
						<span
							class="normal-case tracking-normal text-amber-600 dark:text-amber-400"
							>streaming…</span
						>
					</div>
					<div
						class="h-[2lh] min-w-0 w-full overflow-hidden text-[11px] leading-4 text-zinc-600 dark:text-zinc-300"
					>
						<div class="flex h-full min-h-0 flex-col justify-end">
							<pre
								class="min-w-0 max-w-full whitespace-pre-wrap break-words font-sans wrap-anywhere"
								>{{ itemText(itemOf(current)) }}</pre>
						</div>
					</div>
				</div>
			} @else {
				<lf-feed-collapsible
					[summary]="
						collapsedSummary(
							presentationLabel(itemOf(current)),
							itemOf(current).value
						)
					"
					[value]="itemOf(current).value"
					[open]="isDetailsOpen(current)"
					(openChange)="onDetailsOpen(current, $event)"
					summaryClass="text-zinc-600 dark:text-zinc-300"
				/>
			}
		</ng-template>
	`,
})
export class LfFeedRowComponent {
	readonly row = input.required<FeedRow>();
	readonly openKeys = input.required<ReadonlySet<string>>();
	readonly detailsOpenChange = output<{
		readonly key: string;
		readonly open: boolean;
	}>();

	readonly execution = inject(WorkflowExecutionService);
	private readonly hover = inject(NodeHoverService);
	readonly itemText = itemText;
	readonly collapsedSummary = collapsedSummary;
	readonly presentationLabel = presentationLabel;
	readonly recoveryBanner = recoveryBanner;

	isLaterVisitHeader(): boolean {
		const current = this.row();
		return current.kind === 'header' && !current.isFirstVisit;
	}

	isLastInVisit(): boolean {
		const current = this.row();
		return current.kind === 'item' && current.isLastInVisit;
	}

	isHovered(): boolean {
		return this.hover.isHovered(this.row().nodeId);
	}

	onRowEnter(): void {
		this.hover.set(this.row().nodeId);
	}

	onRowLeave(): void {
		this.hover.clear();
	}

	itemOf(row: FeedItemRow): FeedItemRow['item'] {
		return row.item;
	}

	markdownHtml(text: string): string {
		return renderMarkdown(text);
	}

	isDetailsOpen(row: FeedItemRow): boolean {
		return this.openKeys().has(
			feedDetailsOpenKey(row.visitId, row.segmentId, row.item.seq),
		);
	}

	onDetailsOpen(row: FeedItemRow, open: boolean): void {
		this.detailsOpenChange.emit({
			key: feedDetailsOpenKey(row.visitId, row.segmentId, row.item.seq),
			open,
		});
	}
}
