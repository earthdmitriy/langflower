import { describe, expect, it } from 'vitest';
import { chunkMarkdown } from './chunk-markdown.ts';

describe('chunkMarkdown', () => {
	it('keeps a heading-less file as one intro chunk', () => {
		const chunks = chunkMarkdown('notes.md', 'hello world\n');
		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.heading).toBe('');
		expect(chunks[0]?.id).toBe('notes.md#intro#0');
		expect(chunks[0]?.text).toBe('hello world');
	});

	it('splits on headings and builds breadcrumbs', () => {
		const source = [
			'preamble',
			'# Alpha',
			'a body',
			'## Beta',
			'b body',
			'# Gamma',
			'c body',
		].join('\n');
		const chunks = chunkMarkdown('doc.md', source);
		expect(chunks.map((chunk) => chunk.heading)).toEqual([
			'',
			'Alpha',
			'Alpha > Beta',
			'Gamma',
		]);
		expect(chunks[2]?.id).toBe('doc.md#alpha-beta#2');
		expect(chunks[2]?.embedText).toContain('doc.md');
		expect(chunks[2]?.text).toBe('b body');
	});

	it('skips empty heading bodies', () => {
		const chunks = chunkMarkdown('empty.md', '# Only\n\n# Next\ntext\n');
		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.heading).toBe('Next');
	});
});
