import {
	DIVIDER_MIN_COMPOSER_HEIGHT,
	DIVIDER_MIN_LEFT_WIDTH,
	DIVIDER_MIN_RIGHT_WIDTH,
} from '@langflower/shared/langflower';
import { describe, expect, it } from 'vitest';
import {
	DIVIDER_CENTER_MIN_WIDTH_PX,
	DIVIDER_COMPOSER_GUTTER_HEIGHT_PX,
	DIVIDER_HORIZONTAL_GUTTERS_PX,
	DIVIDER_SIDEBAR_BODY_MIN_HEIGHT_PX,
	clampDividerDrag,
	clampDividerPositionsToViewport,
} from '../utils/clamp-divider-positions.js';

describe('clampDividerDrag', () => {
	const layout = { rowWidth: 1400, rightAsideHeight: 900 };
	const current = {
		leftWidth: 280,
		rightWidth: 360,
		composerHeight: 168,
	};

	it('allows left sidebar nearly full row minus right + center strip', () => {
		const max =
			layout.rowWidth -
			current.rightWidth -
			DIVIDER_HORIZONTAL_GUTTERS_PX -
			DIVIDER_CENTER_MIN_WIDTH_PX;
		expect(clampDividerDrag('left', 2000, current, layout)).toBe(max);
		expect(max).toBeGreaterThan(480);
	});

	it('allows right sidebar nearly full row minus left + center strip', () => {
		const max =
			layout.rowWidth -
			current.leftWidth -
			DIVIDER_HORIZONTAL_GUTTERS_PX -
			DIVIDER_CENTER_MIN_WIDTH_PX;
		expect(clampDividerDrag('right', 2000, current, layout)).toBe(max);
		expect(max).toBeGreaterThan(560);
	});

	it('allows composer nearly full right-aside height minus body floor', () => {
		const max =
			layout.rightAsideHeight -
			DIVIDER_SIDEBAR_BODY_MIN_HEIGHT_PX -
			DIVIDER_COMPOSER_GUTTER_HEIGHT_PX;
		expect(clampDividerDrag('composer', 2000, current, layout)).toBe(max);
		expect(max).toBeGreaterThan(320);
	});

	it('keeps content mins', () => {
		expect(clampDividerDrag('left', 10, current, layout)).toBe(
			DIVIDER_MIN_LEFT_WIDTH,
		);
		expect(clampDividerDrag('right', 10, current, layout)).toBe(
			DIVIDER_MIN_RIGHT_WIDTH,
		);
		expect(clampDividerDrag('composer', 10, current, layout)).toBe(
			DIVIDER_MIN_COMPOSER_HEIGHT,
		);
	});
});

describe('clampDividerPositionsToViewport', () => {
	it('passes through sizes that already fit', () => {
		const positions = {
			leftWidth: 280,
			rightWidth: 360,
			composerHeight: 168,
		};
		expect(
			clampDividerPositionsToViewport(positions, {
				rowWidth: 1400,
				rightAsideHeight: 900,
			}),
		).toEqual(positions);
	});

	it('shrinks sidebars when the window no longer fits both', () => {
		const next = clampDividerPositionsToViewport(
			{ leftWidth: 700, rightWidth: 700, composerHeight: 168 },
			{ rowWidth: 900, rightAsideHeight: 900 },
		);
		const budget =
			900 - DIVIDER_HORIZONTAL_GUTTERS_PX - DIVIDER_CENTER_MIN_WIDTH_PX;
		expect(next.leftWidth + next.rightWidth).toBeLessThanOrEqual(budget);
		expect(next.leftWidth + next.rightWidth).toBe(budget);
	});

	it('caps composer to the right-aside body floor', () => {
		const next = clampDividerPositionsToViewport(
			{ leftWidth: 280, rightWidth: 360, composerHeight: 800 },
			{ rowWidth: 1400, rightAsideHeight: 400 },
		);
		expect(next.composerHeight).toBe(
			400 -
				DIVIDER_SIDEBAR_BODY_MIN_HEIGHT_PX -
				DIVIDER_COMPOSER_GUTTER_HEIGHT_PX,
		);
	});
});
