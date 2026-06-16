import { describe, expect, it } from 'vitest';
import { sizeFromSeResizeDelta } from '../utils/se-node-resize-gesture.js';

describe('sizeFromSeResizeDelta', () => {
	it('grows width and height from SE flow delta', () => {
		expect(
			sizeFromSeResizeDelta(
				{ width: 200, height: 100 },
				{ x: 10, y: 20 },
				{ x: 40, y: 50 },
				{ width: 160, height: 72 },
			),
		).toEqual({ width: 230, height: 130 });
	});

	it('clamps to min size when dragging inward', () => {
		expect(
			sizeFromSeResizeDelta(
				{ width: 200, height: 100 },
				{ x: 100, y: 100 },
				{ x: 0, y: 0 },
				{ width: 160, height: 72 },
			),
		).toEqual({ width: 160, height: 72 });
	});
});
