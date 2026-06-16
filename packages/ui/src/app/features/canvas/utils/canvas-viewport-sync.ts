import { CanvasViewport } from '@langflower/shared/langflower';

const VIEWPORT_COORD_EPSILON = 0.01;

export function sameCanvasViewport(
	left: CanvasViewport,
	right: CanvasViewport,
): boolean {
	return (
		Math.abs(left.x - right.x) < VIEWPORT_COORD_EPSILON &&
		Math.abs(left.y - right.y) < VIEWPORT_COORD_EPSILON &&
		Math.abs(left.scale - right.scale) < VIEWPORT_COORD_EPSILON
	);
}

export function isDefaultCanvasViewport(viewport: CanvasViewport): boolean {
	return sameCanvasViewport(viewport, { x: 0, y: 0, scale: 1 });
}

export type CanvasViewportPublishGate = {
	readonly publish: boolean;
	/** True after the mount/hydrate echo was consumed (or never needed). */
	readonly hydrateConsumed: boolean;
};

/**
 * Gate ng-diagram viewport emissions before `editor.viewport.requested`.
 * Until hydrate is consumed: skip the echo of `hydrated` and skip the
 * library init default when `hydrated` is non-default. After that, every
 * distinct viewport is publishable (including a pan back to the start).
 */
export function gateCanvasViewportPublish(
	next: CanvasViewport,
	hydrated: CanvasViewport,
	hydrateConsumed: boolean,
): CanvasViewportPublishGate {
	if (hydrateConsumed) {
		return { publish: true, hydrateConsumed: true };
	}

	if (sameCanvasViewport(next, hydrated)) {
		return { publish: false, hydrateConsumed: true };
	}

	if (isDefaultCanvasViewport(next) && !isDefaultCanvasViewport(hydrated)) {
		return { publish: false, hydrateConsumed: false };
	}

	// Unexpected pre-hydrate emission — keep waiting for the echo.
	return { publish: false, hydrateConsumed: false };
}
