// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
	BELOW_ROUTE_GAP_PX,
	BELOW_ROUTE_STUB_PX,
	buildBelowRoutePoints,
	resolveNodeBounds,
} from '../utils/build-below-route-points';

describe('buildBelowRoutePoints', () => {
	const source = { x: 400, y: 120 };
	const target = { x: 100, y: 80 };
	const sourceBounds = { left: 200, top: 40, width: 180, height: 200 };
	const targetBounds = { left: 40, top: 20, width: 160, height: 100 };

	it('starts at source and ends at target', () => {
		const points = buildBelowRoutePoints(
			source,
			target,
			sourceBounds,
			targetBounds,
		);
		expect(points[0]).toEqual(source);
		expect(points[points.length - 1]).toEqual(target);
	});

	it('routes below both node bottoms with gap', () => {
		const points = buildBelowRoutePoints(
			source,
			target,
			sourceBounds,
			targetBounds,
		);
		const expectedBelowY =
			Math.max(
				sourceBounds.top + sourceBounds.height,
				targetBounds.top + targetBounds.height,
			) + BELOW_ROUTE_GAP_PX;
		expect(points[2]?.y).toBe(expectedBelowY);
		expect(points[3]?.y).toBe(expectedBelowY);
		expect(expectedBelowY).toBeGreaterThanOrEqual(
			sourceBounds.top + sourceBounds.height + BELOW_ROUTE_GAP_PX,
		);
	});

	it('uses right stub from source and left stub into target', () => {
		const points = buildBelowRoutePoints(
			source,
			target,
			sourceBounds,
			targetBounds,
		);
		expect(points[1]).toEqual({
			x: source.x + BELOW_ROUTE_STUB_PX,
			y: source.y,
		});
		expect(points[4]).toEqual({
			x: target.x - BELOW_ROUTE_STUB_PX,
			y: target.y,
		});
	});
});

describe('resolveNodeBounds', () => {
	it('prefers size over measuredBounds', () => {
		expect(
			resolveNodeBounds({
				position: { x: 10, y: 20 },
				size: { width: 100, height: 50 },
				measuredBounds: { x: 0, y: 0, width: 1, height: 1 },
			}),
		).toEqual({ left: 10, top: 20, width: 100, height: 50 });
	});

	it('falls back to measuredBounds when size is missing', () => {
		expect(
			resolveNodeBounds({
				position: { x: 10, y: 20 },
				measuredBounds: { x: 5, y: 6, width: 80, height: 40 },
			}),
		).toEqual({ left: 5, top: 6, width: 80, height: 40 });
	});

	it('returns null when neither size nor measuredBounds is usable', () => {
		expect(resolveNodeBounds(null)).toBe(null);
		expect(
			resolveNodeBounds({
				position: { x: 0, y: 0 },
				size: { width: 0, height: 10 },
			}),
		).toBe(null);
	});
});
