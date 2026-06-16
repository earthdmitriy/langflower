import {
	DIVIDER_MIN_COMPOSER_HEIGHT,
	DIVIDER_MIN_LEFT_WIDTH,
	DIVIDER_MIN_RIGHT_WIDTH,
	DIVIDER_SANITY_MAX,
	type DividerPositions,
} from '@langflower/shared/langflower';

/** Each vertical resize handle is Tailwind `w-1` (4px). */
const DIVIDER_GUTTER_WIDTH_PX = 4;

/** Two vertical gutters between left / canvas / right. */
export const DIVIDER_HORIZONTAL_GUTTERS_PX = DIVIDER_GUTTER_WIDTH_PX * 2;

/** Minimum canvas strip so sidebars cannot fully collapse the center. */
export const DIVIDER_CENTER_MIN_WIDTH_PX = 64;

/** Horizontal resize handle above the composer (`h-1`). */
export const DIVIDER_COMPOSER_GUTTER_HEIGHT_PX = 4;

/** Minimum work-log / inspector band above the composer. */
export const DIVIDER_SIDEBAR_BODY_MIN_HEIGHT_PX = 80;

export type DividerResizeTarget = 'left' | 'right' | 'composer';

export type DividerViewportLayout = {
	readonly rowWidth: number;
	readonly rightAsideHeight: number;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(value, min), max);

export const clampDividerDrag = (
	target: DividerResizeTarget,
	next: number,
	current: DividerPositions,
	layout: DividerViewportLayout,
): number => {
	if (target === 'left') {
		const max = Math.max(
			DIVIDER_MIN_LEFT_WIDTH,
			layout.rowWidth -
				current.rightWidth -
				DIVIDER_HORIZONTAL_GUTTERS_PX -
				DIVIDER_CENTER_MIN_WIDTH_PX,
		);
		return clamp(next, DIVIDER_MIN_LEFT_WIDTH, max);
	}

	if (target === 'right') {
		const max = Math.max(
			DIVIDER_MIN_RIGHT_WIDTH,
			layout.rowWidth -
				current.leftWidth -
				DIVIDER_HORIZONTAL_GUTTERS_PX -
				DIVIDER_CENTER_MIN_WIDTH_PX,
		);
		return clamp(next, DIVIDER_MIN_RIGHT_WIDTH, max);
	}

	const max = Math.max(
		DIVIDER_MIN_COMPOSER_HEIGHT,
		layout.rightAsideHeight -
			DIVIDER_SIDEBAR_BODY_MIN_HEIGHT_PX -
			DIVIDER_COMPOSER_GUTTER_HEIGHT_PX,
	);
	return clamp(next, DIVIDER_MIN_COMPOSER_HEIGHT, max);
};

/**
 * Fit persisted / snapshot sizes into the current shell so panels never
 * overlap the canvas (or each other). When the window is smaller than both
 * content mins + center strip, mins are scaled down to keep no-overlap.
 */
export const clampDividerPositionsToViewport = (
	positions: DividerPositions,
	layout: DividerViewportLayout,
): DividerPositions => {
	const budget = Math.max(
		0,
		layout.rowWidth -
			DIVIDER_HORIZONTAL_GUTTERS_PX -
			DIVIDER_CENTER_MIN_WIDTH_PX,
	);

	let leftWidth = clamp(
		positions.leftWidth,
		DIVIDER_MIN_LEFT_WIDTH,
		DIVIDER_SANITY_MAX,
	);
	let rightWidth = clamp(
		positions.rightWidth,
		DIVIDER_MIN_RIGHT_WIDTH,
		DIVIDER_SANITY_MAX,
	);

	if (leftWidth + rightWidth > budget) {
		rightWidth = clamp(budget - leftWidth, 0, DIVIDER_SANITY_MAX);
		if (leftWidth + rightWidth > budget) {
			leftWidth = clamp(budget - rightWidth, 0, DIVIDER_SANITY_MAX);
		}
		if (leftWidth + rightWidth > budget && leftWidth + rightWidth > 0) {
			const scale = budget / (leftWidth + rightWidth);
			leftWidth = Math.floor(leftWidth * scale);
			rightWidth = Math.max(0, budget - leftWidth);
		}
	}

	const composerMax = Math.max(
		DIVIDER_MIN_COMPOSER_HEIGHT,
		layout.rightAsideHeight -
			DIVIDER_SIDEBAR_BODY_MIN_HEIGHT_PX -
			DIVIDER_COMPOSER_GUTTER_HEIGHT_PX,
	);
	const composerHeight = clamp(
		positions.composerHeight,
		DIVIDER_MIN_COMPOSER_HEIGHT,
		Math.min(composerMax, DIVIDER_SANITY_MAX),
	);

	return { leftWidth, rightWidth, composerHeight };
};

export const sameDividerPositions = (
	a: DividerPositions,
	b: DividerPositions,
): boolean =>
	a.leftWidth === b.leftWidth &&
	a.rightWidth === b.rightWidth &&
	a.composerHeight === b.composerHeight;
