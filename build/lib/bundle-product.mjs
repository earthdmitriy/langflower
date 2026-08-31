/**
 * Product CLI esbuild (install-local / pack-release).
 *
 * Workspace `tsc` emit stays unbundled for tests and `npm run start -w
 * @langflower/cli`. The published `dist/` is concatenated so a cold start
 * is not hundreds of ESM `open()`s after the heartbeat line.
 *
 * Host peers stay external so custom-pack `file://` rewrites share module
 * identity with the process (BUG-2026-07-28). `typescript` and `esbuild`
 * stay external so the start chunk does not parse the toolchain.
 */

import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PACKAGES, ROOT } from './paths.mjs';
import { log } from './logger.mjs';

/** Never inline into the start chunk (or any product chunk). */
export const PRODUCT_BUNDLE_EXTERNALS = [
	'typescript',
	'esbuild',
	'@esbuild/*',
	'@langflower/node-sdk',
	'@langflower/node-sdk/*',
	'@langflower/runtime',
	'@langflower/runtime/*',
	'rxjs',
	'rxjs/*',
	'@rx-evo/stateful-observable',
	'@rx-evo/stateful-observable/*',
];

/**
 * Bundled CJS (commander, express, …) calls `require('node:events')`.
 * esbuild's ESM `__require` shim throws unless a real `require` exists.
 */
export const PRODUCT_BUNDLE_CJS_BANNER = `import { createRequire as __lfCreateRequire } from 'node:module';
const require = __lfCreateRequire(import.meta.url);
`;

const walkJsFiles = async (dir) => {
	/** @type {string[]} */
	const files = [];
	let entries;
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return files;
	}

	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkJsFiles(full)));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith('.js')) {
			files.push(full);
		}
	}

	return files;
};

export const countJsFiles = async (dir) => (await walkJsFiles(dir)).length;

/**
 * Unbundled workspace emit that used to ship as product `dist/` + vendor
 * start graph (measurement baseline for epic 44).
 */
export const countUnbundledWorkspaceJs = async () => {
	const keys = [
		'cli',
		'server',
		'commonNodes',
		'shared',
		'websocketBridge',
		'tools',
		'eval',
		'compiler',
	];
	let total = 0;
	for (const key of keys) {
		total += await countJsFiles(path.join(PACKAGES[key].dir, 'dist'));
	}
	return total;
};

/**
 * Bundle CLI `dist/index.js` (and split eval / compile chunks) into
 * `outdir`.
 *
 * @param {{ entryIndex: string, outdir: string }} options
 * @returns {Promise<{ jsFileCount: number, metafile: import('esbuild').Metafile }>}
 */
export const bundleProductCli = async (options) => {
	await fs.mkdir(options.outdir, { recursive: true });

	const result = await esbuild.build({
		absWorkingDir: ROOT,
		entryPoints: [options.entryIndex],
		entryNames: 'index',
		chunkNames: 'chunk-[hash]',
		outdir: options.outdir,
		bundle: true,
		splitting: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		packages: 'bundle',
		sourcemap: false,
		sourcesContent: false,
		legalComments: 'none',
		metafile: true,
		logLevel: 'warning',
		banner: { js: PRODUCT_BUNDLE_CJS_BANNER },
		external: PRODUCT_BUNDLE_EXTERNALS,
	});

	const jsFileCount = await countJsFiles(options.outdir);
	const unbundled = await countUnbundledWorkspaceJs();
	log.info(
		`Product CLI bundle → ${path.relative(ROOT, options.outdir) || '.'} ` +
			`(${String(jsFileCount)} JS file(s); workspace tsc emit ${String(unbundled)} JS)`,
	);

	return { jsFileCount, metafile: result.metafile };
};
