// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { Edge, EdgeRoutingContext, Node, Point } from 'ng-diagram';
import { BELOW_ROUTE_GAP_PX } from '../utils/build-below-route-points';
import { computeBackEdgeAwarePoints } from '../utils/compute-back-edge-aware-points';

const makeContext = (
	sourcePoint: Point & { side: 'left' | 'right' | 'top' | 'bottom' },
	targetPoint: Point & { side: 'left' | 'right' | 'top' | 'bottom' },
	sourceNode?: Node,
	targetNode?: Node,
): EdgeRoutingContext => ({
	edge: {
		id: 'e1',
		source: sourceNode?.id ?? 'n1',
		target: targetNode?.id ?? 'n2',
		data: {},
	} satisfies Edge,
	sourcePoint,
	targetPoint,
	...(sourceNode !== undefined ? { sourceNode } : {}),
	...(targetNode !== undefined ? { targetNode } : {}),
});

const straightFallback = (context: EdgeRoutingContext): Point[] => [
	{ x: context.sourcePoint.x, y: context.sourcePoint.y },
	{ x: context.targetPoint.x, y: context.targetPoint.y },
];

const withReverse = { hasReverseEdge: true } as const;
const withoutReverse = { hasReverseEdge: false } as const;

describe('computeBackEdgeAwarePoints', () => {
	it('routes the lower loop leg below both bottoms', () => {
		const sourceNode: Node = {
			id: 'hitl',
			position: { x: 180, y: 240 },
			size: { width: 160, height: 100 },
			data: {},
		};
		const targetNode: Node = {
			id: 'llm',
			position: { x: 200, y: 0 },
			size: { width: 180, height: 200 },
			data: {},
		};
		const sourcePoint = { x: 340, y: 320, side: 'right' as const };
		const targetPoint = { x: 200, y: 40, side: 'left' as const };
		const points = computeBackEdgeAwarePoints(
			makeContext(sourcePoint, targetPoint, sourceNode, targetNode),
			straightFallback,
			undefined,
			withReverse,
		);

		expect(points[0]).toEqual({ x: 340, y: 320 });
		expect(points[points.length - 1]).toEqual({ x: 200, y: 40 });
		const belowY = Math.max(240 + 100, 0 + 200) + BELOW_ROUTE_GAP_PX;
		expect(points.some((p) => p.y === belowY)).toBe(true);
	});

	it('on diagonal, below-routes upper→lower forward (LLM → HITL)', () => {
		const sourceNode: Node = {
			id: 'llm',
			position: { x: 400, y: 0 },
			size: { width: 220, height: 200 },
			data: {},
		};
		const targetNode: Node = {
			id: 'hitl',
			position: { x: 40, y: 240 },
			size: { width: 200, height: 120 },
			data: {},
		};
		const sourcePoint = { x: 620, y: 100, side: 'right' as const };
		const targetPoint = { x: 40, y: 280, side: 'left' as const };
		const points = computeBackEdgeAwarePoints(
			makeContext(sourcePoint, targetPoint, sourceNode, targetNode),
			straightFallback,
			undefined,
			withReverse,
		);

		const belowY = Math.max(0 + 200, 240 + 120) + BELOW_ROUTE_GAP_PX;
		expect(points.some((p) => p.y === belowY)).toBe(true);
	});

	it('on diagonal, does not below-route lower→upper return', () => {
		const sourceNode: Node = {
			id: 'hitl',
			position: { x: 40, y: 240 },
			size: { width: 200, height: 120 },
			data: {},
		};
		const targetNode: Node = {
			id: 'llm',
			position: { x: 400, y: 0 },
			size: { width: 220, height: 200 },
			data: {},
		};
		const sourcePoint = { x: 240, y: 300, side: 'right' as const };
		const targetPoint = { x: 400, y: 40, side: 'left' as const };
		const points = computeBackEdgeAwarePoints(
			makeContext(sourcePoint, targetPoint, sourceNode, targetNode),
			straightFallback,
			undefined,
			withReverse,
		);

		expect(points).toEqual([
			{ x: 240, y: 300 },
			{ x: 400, y: 40 },
		]);
	});

	it('on same row, below-routes the leftward loop leg', () => {
		const sourceNode: Node = {
			id: 'hitl',
			position: { x: 300, y: 40 },
			size: { width: 100, height: 80 },
			data: {},
		};
		const targetNode: Node = {
			id: 'llm',
			position: { x: 40, y: 40 },
			size: { width: 100, height: 80 },
			data: {},
		};
		const sourcePoint = { x: 400, y: 80, side: 'right' as const };
		const targetPoint = { x: 40, y: 80, side: 'left' as const };
		const points = computeBackEdgeAwarePoints(
			makeContext(sourcePoint, targetPoint, sourceNode, targetNode),
			straightFallback,
			undefined,
			withReverse,
		);

		const belowY = Math.max(40 + 80, 40 + 80) + BELOW_ROUTE_GAP_PX;
		expect(points.some((p) => p.y === belowY)).toBe(true);
	});

	it('on same row, does not below-route the rightward loop leg', () => {
		const sourceNode: Node = {
			id: 'llm',
			position: { x: 40, y: 40 },
			size: { width: 100, height: 80 },
			data: {},
		};
		const targetNode: Node = {
			id: 'hitl',
			position: { x: 300, y: 40 },
			size: { width: 100, height: 80 },
			data: {},
		};
		const sourcePoint = { x: 140, y: 80, side: 'right' as const };
		const targetPoint = { x: 300, y: 80, side: 'left' as const };
		const points = computeBackEdgeAwarePoints(
			makeContext(sourcePoint, targetPoint, sourceNode, targetNode),
			straightFallback,
			undefined,
			withReverse,
		);

		expect(points).toEqual([
			{ x: 140, y: 80 },
			{ x: 300, y: 80 },
		]);
	});

	it('falls back when node sizes are missing', () => {
		const sourcePoint = { x: 400, y: 200, side: 'right' as const };
		const targetPoint = { x: 100, y: 80, side: 'left' as const };
		const points = computeBackEdgeAwarePoints(
			makeContext(sourcePoint, targetPoint),
			straightFallback,
			undefined,
			withReverse,
		);
		expect(points).toEqual([
			{ x: 400, y: 200 },
			{ x: 100, y: 80 },
		]);
	});

	it('does not below-route forward wires from the upper node', () => {
		const sourceNode: Node = {
			id: 'llm',
			position: { x: 200, y: 0 },
			size: { width: 180, height: 200 },
			data: {},
		};
		const targetNode: Node = {
			id: 'hitl',
			position: { x: 180, y: 240 },
			size: { width: 160, height: 100 },
			data: {},
		};
		const sourcePoint = { x: 380, y: 100, side: 'right' as const };
		const targetPoint = { x: 180, y: 260, side: 'left' as const };
		const points = computeBackEdgeAwarePoints(
			makeContext(sourcePoint, targetPoint, sourceNode, targetNode),
			straightFallback,
			undefined,
			withReverse,
		);

		expect(points).toEqual([
			{ x: 380, y: 100 },
			{ x: 180, y: 260 },
		]);
	});

	it('does not below-route one-way lower→upper wires (HITL → Finish)', () => {
		const sourceNode: Node = {
			id: 'hitl',
			position: { x: 40, y: 240 },
			size: { width: 200, height: 120 },
			data: {},
		};
		const targetNode: Node = {
			id: 'finish',
			position: { x: 400, y: 80 },
			size: { width: 160, height: 80 },
			data: {},
		};
		const sourcePoint = { x: 240, y: 300, side: 'right' as const };
		const targetPoint = { x: 400, y: 120, side: 'left' as const };
		const points = computeBackEdgeAwarePoints(
			makeContext(sourcePoint, targetPoint, sourceNode, targetNode),
			straightFallback,
			undefined,
			withoutReverse,
		);

		expect(points).toEqual([
			{ x: 240, y: 300 },
			{ x: 400, y: 120 },
		]);
	});
});
