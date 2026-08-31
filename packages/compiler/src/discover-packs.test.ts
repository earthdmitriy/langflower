import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasCustomNodePacks } from './discover-packs.js';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

describe('discover-packs (light module)', () => {
	it('does not import typescript or esbuild', () => {
		const source = fs.readFileSync(
			path.join(srcDir, 'discover-packs.ts'),
			'utf8',
		);
		expect(source).not.toMatch(/['"]typescript['"]/);
		expect(source).not.toMatch(/['"]esbuild['"]/);
		expect(source).not.toContain('typecheck-pack');
		expect(source).not.toContain('bundle-pack');
	});

	it('hasCustomNodePacks is false when nodes/ is missing', async () => {
		expect(await hasCustomNodePacks(srcDir)).toBe(false);
	});
});
