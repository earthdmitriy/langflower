import { describe, expect, it } from 'vitest';
import { hoverTipStyle } from './lf-hover-tip.component';

const rect = {
	top: 10,
	left: 20,
	right: 60,
	bottom: 30,
	width: 40,
	height: 20,
};

const viewport = { width: 800, height: 600 };

describe('hoverTipStyle', () => {
	it('places a bottom-centered tip below the anchor', () => {
		const style = hoverTipStyle(rect, 'bottom', 'center', viewport);
		expect(style).toContain('top:38px');
		expect(style).toContain('left:40px');
		expect(style).toContain('transform:translateX(-50%)');
	});

	it('places an end-aligned tip on the anchor edge', () => {
		const style = hoverTipStyle(rect, 'bottom', 'end', viewport);
		expect(style).toContain('right:740px');
		expect(style).not.toContain('transform:');
	});
});
