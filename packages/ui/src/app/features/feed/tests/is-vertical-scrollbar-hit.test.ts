import { describe, expect, it } from 'vitest';
import { isVerticalScrollbarHit } from '../is-vertical-scrollbar-hit';

describe('isVerticalScrollbarHit', () => {
	it('is true on the scrollbar strip at the right edge', () => {
		expect(isVerticalScrollbarHit(396, 400, 8)).toBe(true);
		expect(isVerticalScrollbarHit(392, 400, 8)).toBe(true);
	});

	it('is false over the content pane', () => {
		expect(isVerticalScrollbarHit(200, 400, 8)).toBe(false);
		expect(isVerticalScrollbarHit(391, 400, 8)).toBe(false);
	});

	it('is false when there is no scrollbar', () => {
		expect(isVerticalScrollbarHit(400, 400, 0)).toBe(false);
	});
});
