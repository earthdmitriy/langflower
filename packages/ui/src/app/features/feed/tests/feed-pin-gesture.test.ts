import { describe, expect, it } from 'vitest';
import {
	pinGestureFromScrollKey,
	pinGestureFromTouchDelta,
	pinGestureFromWheelDelta,
} from '../feed-pin-gesture';

describe('pinGestureFromWheelDelta', () => {
	it('unpins on scroll-up', () => {
		expect(pinGestureFromWheelDelta(-40)).toBe('unpin');
	});

	it('maybe-repins on scroll-down', () => {
		expect(pinGestureFromWheelDelta(40)).toBe('maybe-repin');
	});

	it('ignores a horizontal-only wheel', () => {
		expect(pinGestureFromWheelDelta(0)).toBe('ignore');
	});
});

describe('pinGestureFromTouchDelta', () => {
	it('unpins when the finger moves down', () => {
		expect(pinGestureFromTouchDelta(12)).toBe('unpin');
	});

	it('maybe-repins when the finger moves up', () => {
		expect(pinGestureFromTouchDelta(-12)).toBe('maybe-repin');
	});

	it('ignores small jitter', () => {
		expect(pinGestureFromTouchDelta(3)).toBe('ignore');
		expect(pinGestureFromTouchDelta(-3)).toBe('ignore');
	});
});

describe('pinGestureFromScrollKey', () => {
	it('unpins keys that move toward older events', () => {
		expect(pinGestureFromScrollKey('ArrowUp')).toBe('unpin');
		expect(pinGestureFromScrollKey('PageUp')).toBe('unpin');
		expect(pinGestureFromScrollKey('Home')).toBe('unpin');
	});

	it('maybe-repins keys that move toward the bottom', () => {
		expect(pinGestureFromScrollKey('ArrowDown')).toBe('maybe-repin');
		expect(pinGestureFromScrollKey('PageDown')).toBe('maybe-repin');
		expect(pinGestureFromScrollKey('End')).toBe('maybe-repin');
	});

	it('ignores unrelated keys', () => {
		expect(pinGestureFromScrollKey('Enter')).toBe('ignore');
	});
});
