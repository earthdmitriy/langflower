import { describe, expect, it } from 'vitest';
import { formatFeedCollapsedPreview } from '../format-feed-collapsed-preview';

describe('formatFeedCollapsedPreview', () => {
	it('shows JSON for objects and arrays without stringifying', () => {
		expect(formatFeedCollapsedPreview({ foo: 1, bar: 2 })).toBe('JSON');
		expect(formatFeedCollapsedPreview([1, 2, 3])).toBe('JSON');
	});

	it('uses the last non-empty line of a multiline string', () => {
		expect(formatFeedCollapsedPreview('line1\nline2\nline3')).toBe('line3');
		expect(formatFeedCollapsedPreview('line1\nline2\n')).toBe('line2');
	});

	it('caps long single-line strings', () => {
		const long = 'a'.repeat(250);
		const preview = formatFeedCollapsedPreview(long);
		expect(preview.endsWith('…')).toBe(true);
		expect(preview.length).toBe(201);
	});

	it('shows (empty) for blank, null, and undefined', () => {
		expect(formatFeedCollapsedPreview('')).toBe('(empty)');
		expect(formatFeedCollapsedPreview('  \n  ')).toBe('(empty)');
		expect(formatFeedCollapsedPreview(null)).toBe('(empty)');
		expect(formatFeedCollapsedPreview(undefined)).toBe('(empty)');
	});

	it('stringifies primitives', () => {
		expect(formatFeedCollapsedPreview(42)).toBe('42');
		expect(formatFeedCollapsedPreview(true)).toBe('true');
	});

	it('uses the Error message first line', () => {
		expect(formatFeedCollapsedPreview(new Error('boom'))).toBe('boom');
		expect(formatFeedCollapsedPreview(new Error('a\nb'))).toBe('a');
	});
});
