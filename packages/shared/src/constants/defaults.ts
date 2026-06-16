import type { ToolConfig } from '../types/config.js';
import type { DividerPositions } from '../types/langflower-bootstrap.js';

export const DEFAULT_PORT = 4010;

export const DEFAULT_CONFIG: ToolConfig = {
	port: DEFAULT_PORT,
	projectDir: '',
};

export const DEFAULT_DIVIDER_POSITIONS: DividerPositions = {
	leftWidth: 280,
	rightWidth: 360,
	composerHeight: 168,
};

/** Content floors (match Tailwind `min-w-[120px]` on editor asides). */
export const DIVIDER_MIN_LEFT_WIDTH = 120;
export const DIVIDER_MIN_RIGHT_WIDTH = 120;
export const DIVIDER_MIN_COMPOSER_HEIGHT = 120;

/**
 * Server-side ceiling only — not a UX max. Real upper bound is viewport-relative
 * on the client (no panel overlap).
 */
export const DIVIDER_SANITY_MAX = 10_000;

export const clampDividerSize = (value: number, min: number): number =>
	Math.min(Math.max(value, min), DIVIDER_SANITY_MAX);

export const clampDividerPositionsSanity = (
	positions: DividerPositions,
): DividerPositions => ({
	leftWidth: clampDividerSize(positions.leftWidth, DIVIDER_MIN_LEFT_WIDTH),
	rightWidth: clampDividerSize(positions.rightWidth, DIVIDER_MIN_RIGHT_WIDTH),
	composerHeight: clampDividerSize(
		positions.composerHeight,
		DIVIDER_MIN_COMPOSER_HEIGHT,
	),
});
