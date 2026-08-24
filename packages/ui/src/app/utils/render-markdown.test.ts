// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
	renderMarkdown,
	renderNodeDescriptionMarkdown,
} from './render-markdown.js';

describe('renderNodeDescriptionMarkdown', () => {
	it('returns null for missing or blank markdown', () => {
		expect(renderNodeDescriptionMarkdown(undefined)).toBeNull();
		expect(renderNodeDescriptionMarkdown('')).toBeNull();
		expect(renderNodeDescriptionMarkdown('   \n\t  ')).toBeNull();
	});

	it('strips common indent so lists are not code', () => {
		const html = renderNodeDescriptionMarkdown(`
			Use this node.

			Typical uses:
			- A file path
			- A prompt fragment
		`);

		expect(html).not.toBeNull();
		expect(html).toContain('<ul>');
		expect(html).toContain('<li>A file path</li>');
		expect(html).not.toContain('<pre>');
	});
});

describe('renderMarkdown', () => {
	it('keeps indented code as code for feed text', () => {
		const html = renderMarkdown('    const x = 1;\n');

		expect(html).toContain('<pre>');
		expect(html).toContain('const x = 1;');
	});
});
