/** Viewport padding when clamping palette popover vertical position. */
export const PALETTE_POPOVER_VIEWPORT_PAD_PX = 8;

/**
 * Keep a fixed popover inside the viewport vertically.
 * Prefer `preferredTop` (usually the row top); shift up when it would overflow
 * the bottom. If taller than the viewport, pin to the top padding.
 */
export const clampPopoverTop = (
	preferredTop: number,
	popoverHeight: number,
	viewportHeight: number,
	paddingPx: number = PALETTE_POPOVER_VIEWPORT_PAD_PX,
): number => {
	if (viewportHeight <= 0 || popoverHeight <= 0) {
		return preferredTop;
	}

	const minTop = paddingPx;
	const maxTop = Math.max(minTop, viewportHeight - popoverHeight - paddingPx);

	return Math.min(Math.max(preferredTop, minTop), maxTop);
};
