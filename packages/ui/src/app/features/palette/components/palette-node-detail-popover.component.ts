import {
	ChangeDetectionStrategy,
	Component,
	afterRenderEffect,
	computed,
	input,
	output,
	signal,
	viewChild,
	ElementRef,
} from '@angular/core';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import {
	PALETTE_POPOVER_VIEWPORT_PAD_PX,
	clampPopoverTop,
} from '../utils/clamp-popover-top.js';
import { PaletteNodePreviewComponent } from './palette-node-preview.component';
import { renderNodeDescriptionMarkdown } from '../../../utils/render-markdown.js';

type PaletteUiSchemaItem = {
	readonly field: string;
	readonly type: string;
	readonly label?: string;
	readonly placement?: 'panel' | 'inline';
};

export type PalettePopoverAnchor = {
	readonly top: number;
	readonly left: number;
	readonly height: number;
	readonly width: number;
};

@Component({
	selector: 'lf-palette-node-detail-popover',
	standalone: true,
	imports: [PaletteNodePreviewComponent],
	template: `
		@if (node() !== null && anchor() !== null) {
			<div
				#popoverRoot
				class="pointer-events-none fixed z-50 w-72"
				[style.top.px]="popoverTop()"
				[style.left.px]="popoverLeft()"
				role="dialog"
				[attr.aria-label]="node()!.displayName"
			>
				<div
					class="pointer-events-auto rounded-lg border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
					(mouseenter)="panelEnter.emit()"
					(mouseleave)="panelLeave.emit()"
				>
					<lf-palette-node-preview [node]="node()!" />

					@if (panelFields().length > 0) {
						<div class="mt-3 pt-1">
							<h3
								class="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
							>
								Panel
							</h3>
							<ul class="mt-1 space-y-1">
								@for (
									field of panelFields();
									track field.field
								) {
									<li
										class="text-[10px] text-zinc-600 dark:text-zinc-300"
									>
										<span class="font-medium">{{
											field.label ?? field.field
										}}</span>
										<span
											class="text-zinc-400 dark:text-zinc-500"
										>
											· {{ field.type }}
										</span>
									</li>
								}
							</ul>
						</div>
					}

					@if (descriptionHtml() !== null) {
						<div
							class="prose prose-xs mt-3 max-w-none pt-1 text-zinc-600 dark:prose-invert dark:text-zinc-300"
							[innerHTML]="descriptionHtml()"
						></div>
					}
				</div>
			</div>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaletteNodeDetailPopoverComponent {
	readonly node = input<PaletteNodeDefinition | null>(null);
	readonly anchor = input<PalettePopoverAnchor | null>(null);
	readonly panelEnter = output<void>();
	readonly panelLeave = output<void>();

	private readonly popoverRoot =
		viewChild<ElementRef<HTMLElement>>('popoverRoot');

	private readonly popoverHeightPx = signal(0);

	constructor() {
		afterRenderEffect(() => {
			this.node();
			this.anchor();
			const el = this.popoverRoot()?.nativeElement;

			if (el === undefined) {
				this.popoverHeightPx.set(0);
				return;
			}

			this.popoverHeightPx.set(el.getBoundingClientRect().height);
		});
	}

	readonly panelFields = computed(() => {
		const current = this.node();

		if (current === null) {
			return [];
		}

		return (current.uiSchema as readonly PaletteUiSchemaItem[]).filter(
			(item) => item.placement !== 'inline',
		);
	});

	readonly descriptionHtml = computed(() => {
		const current = this.node();

		if (current === null) {
			return null;
		}

		return renderNodeDescriptionMarkdown(current.description);
	});

	readonly popoverLeft = computed(() => {
		const rect = this.anchor();

		if (rect === null) {
			return 0;
		}

		return rect.left + rect.width + 8;
	});

	readonly popoverTop = computed(() => {
		const rect = this.anchor();

		if (rect === null) {
			return 0;
		}

		const viewportHeight =
			typeof globalThis !== 'undefined' &&
			typeof globalThis.innerHeight === 'number'
				? globalThis.innerHeight
				: 0;

		return clampPopoverTop(
			rect.top,
			this.popoverHeightPx(),
			viewportHeight,
			PALETTE_POPOVER_VIEWPORT_PAD_PX,
		);
	});
}
