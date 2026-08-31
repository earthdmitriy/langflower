import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = path.dirname(fileURLToPath(import.meta.url));

const readSrc = (relativePath: string): string =>
	fs.readFileSync(path.join(srcDir, relativePath), 'utf8');

describe('create-server import graph (epic 44)', () => {
	it('does not statically import compile-project-nodes', () => {
		const source = readSrc('create-server.ts');
		expect(source).not.toContain(
			'@langflower/compiler/compile-project-nodes',
		);
		expect(source).toContain("from '@langflower/compiler/discover-packs'");
	});

	it('CustomPaletteService loads nodes via the light load-project-nodes export', () => {
		const source = readSrc('palette/custom-palette.service.ts');
		expect(source).not.toContain(
			'@langflower/compiler/compile-project-nodes',
		);
		expect(source).toContain(
			"from '@langflower/compiler/load-project-nodes'",
		);
	});

	it('emit-bootstrap uses the light discover export', () => {
		const source = readSrc('bridge/emit-bootstrap.ts');
		expect(source).not.toContain(
			'@langflower/compiler/compile-project-nodes',
		);
		expect(source).toContain("from '@langflower/compiler/discover-packs'");
	});
});
