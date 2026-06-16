import { describe, expect, it } from 'vitest';
import {
	gateCanvasViewportPublish,
	isDefaultCanvasViewport,
	sameCanvasViewport,
} from '../utils/canvas-viewport-sync.js';

describe('canvas viewport sync helpers', () => {
	it('treats near-equal coordinates as the same viewport', () => {
		expect(
			sameCanvasViewport(
				{ x: -180.79986572265625, y: 320.5331726074219, scale: 1 },
				{ x: -180.8, y: 320.533, scale: 1 },
			),
		).toBe(true);
	});

	it('detects ng-diagram default viewport', () => {
		expect(isDefaultCanvasViewport({ x: 0, y: 0, scale: 1 })).toBe(true);
	});
});

describe('gateCanvasViewportPublish', () => {
	const hydrated = { x: -180.8, y: 320.5, scale: 1 };

	it('consumes hydrate echo without publishing', () => {
		expect(gateCanvasViewportPublish(hydrated, hydrated, false)).toEqual({
			publish: false,
			hydrateConsumed: true,
		});
	});

	it('skips init default before hydrate when pan is non-default', () => {
		expect(
			gateCanvasViewportPublish(
				{ x: 0, y: 0, scale: 1 },
				hydrated,
				false,
			),
		).toEqual({ publish: false, hydrateConsumed: false });
	});

	it('publishes user pan after hydrate was consumed', () => {
		expect(
			gateCanvasViewportPublish(
				{ x: -100, y: 200, scale: 1.25 },
				hydrated,
				true,
			),
		).toEqual({ publish: true, hydrateConsumed: true });
	});

	it('publishes a pan back to the original hydrated viewport after consume', () => {
		expect(gateCanvasViewportPublish(hydrated, hydrated, true)).toEqual({
			publish: true,
			hydrateConsumed: true,
		});
	});
});
