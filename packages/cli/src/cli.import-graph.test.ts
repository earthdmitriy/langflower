import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

const readSrc = (fileName: string): string =>
	fs.readFileSync(path.join(srcDir, fileName), 'utf8');

describe('CLI startup import graph (epic 44 phase 1)', () => {
	it('does not statically import eval-command', () => {
		const source = readSrc('cli.ts');
		expect(source).not.toMatch(/from ['"]\.\/eval-command(?:\.js)?['"]/);
		expect(source).toContain("await import('./eval-command.js')");
	});

	it('bin prints heartbeat then dynamically imports dist', () => {
		const binPath = path.resolve(srcDir, '../bin/langflower.js');
		const source = fs.readFileSync(binPath, 'utf8');
		expect(source).toContain('Starting Langflower...');
		expect(source).toContain("await import('../dist/index.js')");
		expect(source).not.toMatch(/^import ['"]\.\.\/dist\/index\.js['"]/m);
		const rootBin = path.resolve(srcDir, '../../../bin/langflower.js');
		expect(fs.readFileSync(rootBin, 'utf8')).toBe(source);
	});
});
