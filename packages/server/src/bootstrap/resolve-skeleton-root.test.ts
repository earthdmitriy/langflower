import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveSkeletonRoot } from './resolve-skeleton-root.js';

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe('resolveSkeletonRoot', () => {
	it('finds the workspace server skeleton from this module', async () => {
		const root = await resolveSkeletonRoot();
		await expect(
			fs.access(path.join(root, 'instructions.md')),
		).resolves.toBeUndefined();
	});

	it('finds vendor/server/skeleton from a bundled product dist file', async () => {
		const productDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-skeleton-'),
		);
		tempRoots.push(productDir);
		const skeletonDir = path.join(
			productDir,
			'vendor',
			'server',
			'skeleton',
		);
		await fs.mkdir(skeletonDir, { recursive: true });
		await fs.writeFile(
			path.join(skeletonDir, 'instructions.md'),
			'ok\n',
			'utf8',
		);
		const bundled = path.join(productDir, 'dist', 'index.js');
		await fs.mkdir(path.dirname(bundled), { recursive: true });
		await fs.writeFile(bundled, 'export {}\n', 'utf8');

		const root = await resolveSkeletonRoot(pathToFileURL(bundled).href);
		expect(root).toBe(skeletonDir);
	});
});
