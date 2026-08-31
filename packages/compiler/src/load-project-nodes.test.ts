import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadProjectNodes } from './load-project-nodes.js';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

describe('load-project-nodes (light module)', () => {
	it('does not statically import typescript or esbuild', () => {
		const source = fs.readFileSync(
			path.join(srcDir, 'load-project-nodes.ts'),
			'utf8',
		);
		expect(source).not.toMatch(/['"]typescript['"]/);
		expect(source).not.toMatch(/['"]esbuild['"]/);
		expect(source).not.toContain('typecheck-pack');
		expect(source).not.toContain('bundle-pack');
		expect(source).not.toMatch(/^import .+compile-project-nodes/m);
		expect(source).toMatch(
			/await import\(['"]\.\/compile-project-nodes\.js['"]\)/,
		);
	});

	it('reports compiled false when nodes/ is missing', async () => {
		const result = await loadProjectNodes(srcDir);
		expect(result).toEqual({
			nodes: [],
			errors: [],
			compiled: false,
		});
	});
});
