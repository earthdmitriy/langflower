// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { hasReverseEdgeBetween, isBackEdge } from '../utils/is-back-edge';

describe('hasReverseEdgeBetween', () => {
	it('is true when an opposite wire exists', () => {
		expect(
			hasReverseEdgeBetween(
				[
					{ source: 'hitl', target: 'llm' },
					{ source: 'llm', target: 'hitl' },
				],
				'hitl',
				'llm',
			),
		).toBe(true);
	});

	it('is false for one-way edges', () => {
		expect(
			hasReverseEdgeBetween(
				[{ source: 'hitl', target: 'finish' }],
				'hitl',
				'finish',
			),
		).toBe(false);
	});
});

describe('isBackEdge', () => {
	it('is true for lower→upper return when stacked (HITL → FakeLLM)', () => {
		expect(
			isBackEdge({
				sourceBounds: { left: 180, top: 240, width: 160, height: 100 },
				targetBounds: { left: 200, top: 0, width: 180, height: 200 },
				hasReverseEdge: true,
			}),
		).toBe(true);
	});

	it('is false for upper→lower forward when stacked', () => {
		expect(
			isBackEdge({
				sourceBounds: { left: 200, top: 0, width: 180, height: 200 },
				targetBounds: { left: 180, top: 240, width: 160, height: 100 },
				hasReverseEdge: true,
			}),
		).toBe(false);
	});

	it('swaps on diagonal: upper→lower forward is below when upper is right', () => {
		expect(
			isBackEdge({
				sourceBounds: { left: 400, top: 0, width: 220, height: 200 },
				targetBounds: { left: 40, top: 240, width: 200, height: 120 },
				hasReverseEdge: true,
			}),
		).toBe(true);
	});

	it('swaps on diagonal: lower→upper return is not below when upper is right', () => {
		expect(
			isBackEdge({
				sourceBounds: { left: 40, top: 240, width: 200, height: 120 },
				targetBounds: { left: 400, top: 0, width: 220, height: 200 },
				hasReverseEdge: true,
			}),
		).toBe(false);
	});

	it('on same row, below-routes the leftward loop leg', () => {
		expect(
			isBackEdge({
				// HITL (right) → FakeLLM (left)
				sourceBounds: { left: 300, top: 0, width: 100, height: 80 },
				targetBounds: { left: 40, top: 0, width: 100, height: 80 },
				hasReverseEdge: true,
			}),
		).toBe(true);
	});

	it('on same row, does not below-route the rightward loop leg', () => {
		expect(
			isBackEdge({
				// FakeLLM (left) → HITL (right)
				sourceBounds: { left: 40, top: 0, width: 100, height: 80 },
				targetBounds: { left: 300, top: 0, width: 100, height: 80 },
				hasReverseEdge: true,
			}),
		).toBe(false);
	});

	it('is false for lower→upper without a reverse edge (HITL → Finish)', () => {
		expect(
			isBackEdge({
				sourceBounds: { left: 40, top: 240, width: 200, height: 120 },
				targetBounds: { left: 400, top: 80, width: 160, height: 80 },
				hasReverseEdge: false,
			}),
		).toBe(false);
	});

	it('treats any Y difference as stacked (no margin)', () => {
		expect(
			isBackEdge({
				sourceBounds: { left: 0, top: 1, width: 100, height: 40 },
				targetBounds: { left: 0, top: 0, width: 100, height: 40 },
				hasReverseEdge: true,
			}),
		).toBe(true);
	});

	it('falls back to ports when bounds are missing', () => {
		expect(
			isBackEdge({
				sourceBounds: null,
				targetBounds: null,
				sourcePort: { x: 100, y: 200 },
				targetPort: { x: 120, y: 80 },
				hasReverseEdge: true,
			}),
		).toBe(true);
		expect(
			isBackEdge({
				sourceBounds: null,
				targetBounds: null,
				sourcePort: { x: 500, y: 80 },
				targetPort: { x: 100, y: 200 },
				hasReverseEdge: true,
			}),
		).toBe(true);
		expect(
			isBackEdge({
				sourceBounds: null,
				targetBounds: null,
				sourcePort: { x: 100, y: 200 },
				targetPort: { x: 500, y: 80 },
				hasReverseEdge: true,
			}),
		).toBe(false);
		// Same-row leftward via ports
		expect(
			isBackEdge({
				sourceBounds: null,
				targetBounds: null,
				sourcePort: { x: 400, y: 100 },
				targetPort: { x: 100, y: 100 },
				hasReverseEdge: true,
			}),
		).toBe(true);
		expect(
			isBackEdge({
				sourceBounds: null,
				targetBounds: null,
				sourcePort: { x: 400, y: 200 },
				targetPort: { x: 100, y: 80 },
				hasReverseEdge: false,
			}),
		).toBe(false);
	});

	it('is false when reverse edge and geometry are both missing', () => {
		expect(
			isBackEdge({
				sourceBounds: null,
				targetBounds: null,
				hasReverseEdge: false,
			}),
		).toBe(false);
	});
});
