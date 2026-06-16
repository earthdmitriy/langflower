import { describe, expect, it } from 'vitest';
import { normalizeLoopItems } from './map-collect-body.js';

describe('normalizeLoopItems', () => {
	it('accepts string arrays', () => {
		expect(normalizeLoopItems(['a', 'b'])).toEqual(['a', 'b']);
	});

	it('parses JSON arrays', () => {
		expect(normalizeLoopItems('["x","y"]')).toEqual(['x', 'y']);
	});

	it('splits newline lists', () => {
		expect(normalizeLoopItems('one\n two \n\nthree')).toEqual([
			'one',
			'two',
			'three',
		]);
	});

	it('returns empty for blank input', () => {
		expect(normalizeLoopItems('')).toEqual([]);
		expect(normalizeLoopItems(null)).toEqual([]);
	});
});
