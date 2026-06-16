import type { CanvasViewport } from '@langflower/shared/langflower.js';

const VIEWPORT_COORD_EPSILON = 0.01;

/** Epsilon compare — skip no-op viewport writes that would markDirty. */
export const sameCanvasViewport = (
	left: CanvasViewport,
	right: CanvasViewport,
): boolean =>
	Math.abs(left.x - right.x) < VIEWPORT_COORD_EPSILON &&
	Math.abs(left.y - right.y) < VIEWPORT_COORD_EPSILON &&
	Math.abs(left.scale - right.scale) < VIEWPORT_COORD_EPSILON;
