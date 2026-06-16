import { describe, expect, it } from 'vitest';
import {
	extractHtmlTitle,
	extractLinks,
	htmlToText,
	isSameHost,
} from './html.js';

describe('htmlToText', () => {
	it('strips tags and collapses whitespace', () => {
		const text = htmlToText(
			'<html><body><h1>Hello</h1><p>world</p><script>ignore()</script></body></html>',
		);

		expect(text).toBe('Hello world');
	});

	it('extracts document title via htmlToText (entity/tag decode)', () => {
		expect(
			extractHtmlTitle(
				'<html><head><title>Docs &amp; API</title></head><body></body></html>',
			),
		).toBe('Docs & API');
	});
});

describe('extractLinks', () => {
	it('resolves relative links against base URL', () => {
		const links = extractLinks(
			'<a href="/docs">Docs</a><a href="https://other.example/page">Other</a>',
			'https://example.com/start',
		);

		expect(links).toEqual([
			'https://example.com/docs',
			'https://other.example/page',
		]);
	});

	it('checks same host', () => {
		expect(
			isSameHost('https://example.com/a', 'https://example.com/b'),
		).toBe(true);
		expect(isSameHost('https://example.com/a', 'https://other.com/b')).toBe(
			false,
		);
	});
});
