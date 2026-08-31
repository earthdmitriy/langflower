import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
	bundleProductCli,
	countJsFiles,
	countUnbundledWorkspaceJs,
} from '../../../build/lib/bundle-product.mjs';

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);
const CLI_INDEX = path.join(ROOT, 'packages/cli/dist/index.js');
const BUNDLE_OUT = path.join(ROOT, 'tests/tmp/product-cli-bundle');

afterEach(async () => {
	await fs.rm(BUNDLE_OUT, { recursive: true, force: true });
});

const readDistJs = async (dir: string): Promise<string> => {
	const files = await fs.readdir(dir);
	const js = files.filter((name) => name.endsWith('.js'));
	const bodies = await Promise.all(
		js.map((name) => fs.readFile(path.join(dir, name), 'utf8')),
	);
	return bodies.join('\n');
};

describe('bundleProductCli (epic 44 phase 3)', () => {
	it('emits few JS chunks, keeps toolchain external, and runs --help', async () => {
		await fs.access(CLI_INDEX);
		await fs.rm(BUNDLE_OUT, { recursive: true, force: true });

		const { jsFileCount } = await bundleProductCli({
			entryIndex: CLI_INDEX,
			outdir: BUNDLE_OUT,
		});

		const unbundled = await countUnbundledWorkspaceJs();
		expect(jsFileCount).toBeGreaterThan(0);
		expect(jsFileCount).toBeLessThan(30);
		expect(unbundled).toBeGreaterThan(jsFileCount * 10);
		expect(await countJsFiles(BUNDLE_OUT)).toBe(jsFileCount);

		const indexJs = await fs.readFile(
			path.join(BUNDLE_OUT, 'index.js'),
			'utf8',
		);
		expect(indexJs).toContain('__lfCreateRequire');
		expect(indexJs).not.toMatch(/from\s+["']typescript["']/u);
		expect(indexJs).not.toMatch(/from\s+["']esbuild["']/u);
		expect(indexJs).toMatch(/@langflower\/node-sdk/u);
		expect(
			indexJs.match(/await import\("\.\/chunk-/gu)?.length,
		).toBeGreaterThanOrEqual(2);

		const allJs = await readDistJs(BUNDLE_OUT);
		expect(allJs).toMatch(/from\s+["']typescript["']/u);
		expect(allJs).toMatch(/from\s+["']esbuild["']/u);

		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[path.join(BUNDLE_OUT, 'index.js'), '--help'],
			{ cwd: ROOT, timeout: 20_000 },
		);
		const output = `${stdout}${stderr}`;
		expect(output).not.toContain('Dynamic require');
		expect(output).toMatch(/Usage|langflower/i);
	}, 30_000);
});
