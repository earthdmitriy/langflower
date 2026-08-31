import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { countJsFiles } from '../../../build/lib/bundle-product.mjs';
import {
	collectRegistryDependencies,
	stageProductVendor,
	VENDOR_STAGE_KEYS,
} from '../../../build/lib/stage-release.mjs';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);
const VENDOR_OUT = path.join(ROOT, 'tests/tmp/product-vendor');

afterEach(async () => {
	await fs.rm(VENDOR_OUT, { recursive: true, force: true });
});

describe('stageProductVendor (epic 44 vendor slim)', () => {
	it('copies only host peers and the server skeleton', async () => {
		expect(VENDOR_STAGE_KEYS).toEqual(['runtime', 'nodeSdk']);

		await fs.access(path.join(ROOT, 'packages/node-sdk/dist'));
		await fs.access(path.join(ROOT, 'packages/runtime/dist'));
		await fs.rm(VENDOR_OUT, { recursive: true, force: true });

		await stageProductVendor(VENDOR_OUT);

		await expect(
			fs.access(path.join(VENDOR_OUT, 'node-sdk', 'package.json')),
		).resolves.toBeUndefined();
		await expect(
			fs.access(path.join(VENDOR_OUT, 'runtime', 'package.json')),
		).resolves.toBeUndefined();
		await expect(
			fs.access(
				path.join(VENDOR_OUT, 'server', 'skeleton', 'instructions.md'),
			),
		).resolves.toBeUndefined();

		for (const missing of [
			'common-nodes',
			'compiler',
			'eval',
			'shared',
			'tools',
			'websocket-bridge',
		]) {
			await expect(
				fs.access(path.join(VENDOR_OUT, missing)),
			).rejects.toMatchObject({ code: 'ENOENT' });
		}

		await expect(
			fs.access(path.join(VENDOR_OUT, 'server', 'dist')),
		).rejects.toMatchObject({ code: 'ENOENT' });

		const vendorJs = await countJsFiles(VENDOR_OUT);
		expect(vendorJs).toBeGreaterThan(0);
		expect(vendorJs).toBeLessThan(120);
	});

	it('still hoists registry deps of inlined workspace packages', async () => {
		const deps = await collectRegistryDependencies();
		expect(deps.typescript).toBeDefined();
		expect(deps.esbuild).toBeDefined();
		expect(deps.openai).toBeDefined();
		expect(deps.rxjs).toBeDefined();
	});
});
