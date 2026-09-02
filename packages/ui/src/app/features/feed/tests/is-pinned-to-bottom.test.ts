import { describe, expect, it } from 'vitest';
import { isPinnedToBottom, isPinnedToTop } from '../is-pinned-to-bottom';

describe('isPinnedToTop', () => {
	it('is true at the top of the slice', () => {
		expect(isPinnedToTop(0, 24)).toBe(true);
		expect(isPinnedToTop(24, 24)).toBe(true);
	});

	it('is false after scrolling down', () => {
		expect(isPinnedToTop(25, 24)).toBe(false);
	});
});

describe('isPinnedToBottom', () => {
	it('is true when the remaining distance is within the threshold', () => {
		expect(isPinnedToBottom(1000, 780, 200, 24)).toBe(true);
	});

	it('is true exactly at the threshold', () => {
		expect(isPinnedToBottom(1000, 776, 200, 24)).toBe(true);
	});

	it('is false when the user has scrolled up past the threshold', () => {
		expect(isPinnedToBottom(1000, 700, 200, 24)).toBe(false);
	});

	it('is true when content fits in the viewport', () => {
		expect(isPinnedToBottom(200, 0, 200, 24)).toBe(true);
	});
});
