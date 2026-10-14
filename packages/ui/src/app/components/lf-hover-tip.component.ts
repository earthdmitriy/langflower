import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostListener,
	inject,
	input,
	signal,
} from '@angular/core';

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
				class="pointer-events-none fixed z-40 hidden whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm group-hover:block group-focus-within:block dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
				[style]="tipStyle()"
			>
				{{ tip() }}
			</span>
		}
	`,
})
export class LfHoverTipComponent {
	private readonly host = inject(ElementRef<HTMLElement>);

	/** Tooltip copy; empty string hides the tip. */
	readonly tip = input.required<string>();
	/**
	 * Anchor on the non-side axis: horizontal for top/bottom, vertical for
	 * left/right.
	 */
	readonly align = input<'start' | 'center' | 'end'>('end');
	/** Side of the control where the tip appears. */
	readonly side = input<'top' | 'bottom' | 'left' | 'right'>('top');

	/**
	 * Fixed so the tip escapes the session-tab scroller. That scroller
	 * clips overflow, which left the tip as a line under the active tab.
	 */
	readonly tipStyle = signal('');

	@HostListener('pointerenter')
	@HostListener('focusin')
	protected placeTip(): void {
		this.tipStyle.set(
			hoverTipStyle(
				this.host.nativeElement.getBoundingClientRect(),
				this.side(),
				this.align(),
				{
					width: window.innerWidth,
					height: window.innerHeight,
				},
			),
		);
	}
}

const TIP_GAP_PX = 8;

/** Viewport coordinates for a fixed tooltip. */
export const hoverTipStyle = (
	rect: Pick<
		DOMRect,
		'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'
	>,
	side: 'top' | 'bottom' | 'left' | 'right',
	align: 'start' | 'center' | 'end',
	viewport: { readonly width: number; readonly height: number },
): string => {
	const parts: string[] = [];

	if (side === 'bottom') {
		parts.push(`top:${rect.bottom + TIP_GAP_PX}px`);
	} else if (side === 'top') {
		parts.push(`bottom:${viewport.height - rect.top + TIP_GAP_PX}px`);
	} else if (side === 'left') {
		parts.push(`right:${viewport.width - rect.left + TIP_GAP_PX}px`);
	} else {
		parts.push(`left:${rect.right + TIP_GAP_PX}px`);
	}

	if (side === 'top' || side === 'bottom') {
		if (align === 'start') {
			parts.push(`left:${rect.left}px`);
		} else if (align === 'end') {
			parts.push(`right:${viewport.width - rect.right}px`);
		} else {
			parts.push(`left:${rect.left + rect.width / 2}px`);
			parts.push('transform:translateX(-50%)');
		}
	} else if (align === 'start') {
		parts.push(`top:${rect.top}px`);
	} else if (align === 'end') {
		parts.push(`bottom:${viewport.height - rect.bottom}px`);
	} else {
		parts.push(`top:${rect.top + rect.height / 2}px`);
		parts.push('transform:translateY(-50%)');
	}

	return parts.join(';');
};
