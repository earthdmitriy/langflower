import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Styled hover/focus tooltip for controls. Prefer this over bare `title`
 * (OS tips cannot be themed). Wrap the control; hover works even when the
 * inner button uses `disabled` / `aria-disabled` because the tip is on the
 * wrapper.
 *
 * Placement:
 * - Topbar controls: `side="bottom" align="center"`
 * - Work-log Clear (top-right of panel): `side="left"` so the tip stays in
 *   the panel and is not clipped under the header
 * - Composer footer: default `side="top" align="end"`
 *
 * For `top` / `bottom`, `align` is horizontal. For `left` / `right`, `align`
 * is vertical (`start` = top, `end` = bottom, `center` = middle).
 */
@Component({
	selector: 'lf-hover-tip',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		class: 'group relative inline-flex max-w-full',
	},
	template: `
		<ng-content />
		@if (tip().trim().length > 0) {
			<span
				role="tooltip"
				class="pointer-events-none absolute z-20 hidden whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm group-hover:block group-focus-within:block dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
				[class.bottom-full]="side() === 'top'"
				[class.mb-2]="side() === 'top'"
				[class.top-full]="side() === 'bottom'"
				[class.mt-2]="side() === 'bottom'"
				[class.right-full]="side() === 'left'"
				[class.mr-2]="side() === 'left'"
				[class.left-full]="side() === 'right'"
				[class.ml-2]="side() === 'right'"
				[class.right-0]="isVerticalSide() && align() === 'end'"
				[class.left-0]="isVerticalSide() && align() === 'start'"
				[class.left-1/2]="isVerticalSide() && align() === 'center'"
				[class.-translate-x-1/2]="
					isVerticalSide() && align() === 'center'
				"
				[class.top-0]="isHorizontalSide() && align() === 'start'"
				[class.bottom-0]="isHorizontalSide() && align() === 'end'"
				[class.top-1/2]="isHorizontalSide() && align() === 'center'"
				[class.-translate-y-1/2]="
					isHorizontalSide() && align() === 'center'
				"
			>
				{{ tip() }}
			</span>
		}
	`,
})
export class LfHoverTipComponent {
	/** Tooltip copy; empty string hides the tip. */
	readonly tip = input.required<string>();
	/**
	 * Anchor on the non-side axis: horizontal for top/bottom, vertical for
	 * left/right.
	 */
	readonly align = input<'start' | 'center' | 'end'>('end');
	/** Side of the control where the tip appears. */
	readonly side = input<'top' | 'bottom' | 'left' | 'right'>('top');

	protected isVerticalSide(): boolean {
		const side = this.side();
		return side === 'top' || side === 'bottom';
	}

	protected isHorizontalSide(): boolean {
		const side = this.side();
		return side === 'left' || side === 'right';
	}
}
