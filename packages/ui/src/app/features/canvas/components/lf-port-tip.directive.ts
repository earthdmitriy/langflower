import { Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

const TIP_GAP_PX = 10;
const VIEWPORT_MARGIN_PX = 8;
const ARROW_INSET_PX = 10;

export type PortTipLayoutInput = {
	readonly side: 'in' | 'out';
	/** Port circle bounds (viewport coordinates). */
	readonly anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;
	/** Vertical center of the port name (viewport coordinates). */
	readonly labelCenterY: number;
	/** Measured tooltip; `titleCenterY` is relative to the tooltip top. */
	readonly tip: {
		readonly width: number;
		readonly height: number;
		readonly titleCenterY: number;
	};
	readonly viewport: { readonly width: number; readonly height: number };
};

export type PortTipLayout = {
	readonly left: number;
	readonly top: number;
	/** Arrow center, relative to the tooltip top. */
	readonly arrowTop: number;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * Fixed viewport placement: tooltip sits beside the node (outside it), its
 * title line is centered on the port name, and the arrow points at the circle.
 */
export const portTipLayout = (input: PortTipLayoutInput): PortTipLayout => {
	const { side, anchor, labelCenterY, tip, viewport } = input;
	const rawLeft =
		side === 'in'
			? anchor.left - TIP_GAP_PX - tip.width
			: anchor.right + TIP_GAP_PX;
	const left = clamp(
		rawLeft,
		VIEWPORT_MARGIN_PX,
		viewport.width - tip.width - VIEWPORT_MARGIN_PX,
	);
	const top = clamp(
		labelCenterY - tip.titleCenterY,
		VIEWPORT_MARGIN_PX,
		viewport.height - tip.height - VIEWPORT_MARGIN_PX,
	);
	const anchorCenterY = (anchor.top + anchor.bottom) / 2;
	const arrowTop = clamp(
		anchorCenterY - top,
		ARROW_INSET_PX,
		tip.height - ARROW_INSET_PX,
	);

	return { left, top, arrowTop };
};

/**
 * Hover/focus tooltip for a canvas port row. Hovering the port circle or the
 * port name shows `tipTitle` (name · type) and the optional description in a
 * card beside the node. The card lives on `document.body` so the ng-diagram
 * viewport transform cannot offset it; styles are global (`styles.scss`).
 */
@Directive({
	selector: '[lfPortTip]',
	standalone: true,
	host: {
		'(pointerover)': 'onPointerOver($event)',
		'(pointerleave)': 'hide()',
		'(pointerdown)': 'hide()',
	},
})
export class LfPortTipDirective implements OnDestroy {
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

	readonly side = input.required<'in' | 'out'>({ alias: 'lfPortTip' });
	readonly tipTitle = input.required<string>();
	readonly tipDescription = input<string | undefined>(undefined);
	readonly tipDetails = input<readonly string[] | undefined>(undefined);

	private tipEl: HTMLElement | null = null;

	protected onPointerOver(event: PointerEvent): void {
		const target = event.target;

		if (
			!(target instanceof Element) ||
			target.closest('.lf-port-anchor, .lf-port-row__content') === null
		) {
			this.hide();
			return;
		}

		if (this.tipEl === null) {
			this.show();
		}
	}

	protected hide(): void {
		this.tipEl?.remove();
		this.tipEl = null;
	}

	ngOnDestroy(): void {
		this.hide();
	}

	private show(): void {
		const root = this.host.nativeElement;
		const label = root.querySelector('.lf-port-row__content');
		const circle =
			root.querySelector('ng-diagram-port') ??
			root.querySelector('.lf-port-anchor') ??
			label;

		if (label === null || circle === null) {
			return;
		}

		const side = this.side();
		const tip = document.createElement('div');
		tip.setAttribute('role', 'tooltip');
		tip.className = `lf-port-tip lf-port-tip--${side}`;

		const title = document.createElement('div');
		title.className = 'lf-port-tip__title';
		title.textContent = this.tipTitle();
		tip.append(title);

		const details = this.tipDetails() ?? [];

		if (details.length > 0) {
			const list = document.createElement('ul');
			list.className = 'lf-port-tip__details';

			for (const line of details) {
				const item = document.createElement('li');
				item.textContent = line;
				list.append(item);
			}

			tip.append(list);
		}

		const description = this.tipDescription()?.trim() ?? '';

		if (description !== '') {
			const body = document.createElement('div');
			body.className = 'lf-port-tip__body';
			body.textContent = description;
			tip.append(body);
		}

		tip.style.visibility = 'hidden';
		document.body.append(tip);

		const labelRect = label.getBoundingClientRect();
		const layout = portTipLayout({
			side,
			anchor: circle.getBoundingClientRect(),
			labelCenterY: (labelRect.top + labelRect.bottom) / 2,
			tip: {
				width: tip.offsetWidth,
				height: tip.offsetHeight,
				titleCenterY: title.offsetTop + title.offsetHeight / 2,
			},
			viewport: { width: window.innerWidth, height: window.innerHeight },
		});

		tip.style.left = `${layout.left}px`;
		tip.style.top = `${layout.top}px`;
		tip.style.setProperty(
			'--lf-port-tip-arrow-top',
			`${layout.arrowTop}px`,
		);
		tip.style.visibility = '';
		this.tipEl = tip;
	}
}
