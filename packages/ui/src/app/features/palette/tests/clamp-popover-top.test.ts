import { describe, expect, it } from 'vitest';
import { clampPopoverTop } from '../utils/clamp-popover-top';

describe('clampPopoverTop', () => {
	it('keeps preferred top when the popover fits', () => {
		expect(clampPopoverTop(100, 200, 800, 8)).toBe(100);
	});

	it('shifts up when preferred top would overflow the bottom', () => {
		// preferred 700, height 200, vh 800, pad 8 → maxTop = 592
		expect(clampPopoverTop(700, 200, 800, 8)).toBe(592);
	});

	it('does not go above top padding', () => {
		expect(clampPopoverTop(-20, 100, 800, 8)).toBe(8);
	});

	it('pins to top padding when taller than the viewport', () => {
		expect(clampPopoverTop(100, 900, 800, 8)).toBe(8);
	});

	it('returns preferred top when height or viewport is unknown', () => {
		expect(clampPopoverTop(120, 0, 800, 8)).toBe(120);
		expect(clampPopoverTop(120, 200, 0, 8)).toBe(120);
	});
});
