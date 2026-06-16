import { DEFAULT_MULTILINE_MIN_HEIGHT_PX } from '@langflower/node-sdk';

const GROW_HOST_CLASS = 'lf-port-row-host--grow';
const TITLE_CLASS = 'lf-node-title';
/** `text-xs` / `.lf-node-title` line — used when offsetHeight is already crushed. */
export const NODE_TITLE_FLOOR_PX = 20;

/**
 * Intrinsic content-fit height for SE `getMinNodeSize`.
 *
 * Grow multiline rows may be taller than their floor when the node is large;
 * the floor must still use label + `--lf-multiline-min` (not the current
 * flexed height), so shrinking cannot “teach” a lower min via scrollHeight.
 * Title height is always reserved (flex-shrink: 0 + floor).
 */
export const measureNodeContentMinHeightPx = (
	contentEl: HTMLElement,
	chromePadY: number,
	absoluteFloorPx: number,
): number => {
	const children = Array.from(contentEl.children) as HTMLElement[];
	const bodyHeight = children.reduce((sum, child) => {
		if (child.classList.contains(TITLE_CLASS)) {
			return sum + Math.max(child.offsetHeight, NODE_TITLE_FLOOR_PX);
		}

		if (!child.classList.contains(GROW_HOST_CLASS)) {
			return sum + child.offsetHeight;
		}

		const labelRow = child.querySelector('.lf-port-row');
		const labelHeight =
			labelRow instanceof HTMLElement ? labelRow.offsetHeight : 0;
		const inlinePad = child.querySelector('.lf-port-row__inline');
		const padBottom =
			inlinePad instanceof HTMLElement
				? Number.parseFloat(
						getComputedStyle(inlinePad).paddingBottom,
					) || 0
				: 0;
		const minRaw = getComputedStyle(child)
			.getPropertyValue('--lf-multiline-min')
			.trim();
		const multilineMin =
			Number.parseFloat(minRaw) || DEFAULT_MULTILINE_MIN_HEIGHT_PX;

		return sum + labelHeight + multilineMin + padBottom;
	}, 0);

	return Math.max(absoluteFloorPx, Math.ceil(bodyHeight) + chromePadY);
};
