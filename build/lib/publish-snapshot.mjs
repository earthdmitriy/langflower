/**
 * Publish / install-local snapshot surface.
 *
 * Matches what `build/install-local.mjs` stages: workspace packages listed
 * below plus UI assets embedded as `langflower` `ui-dist`, plus the
 * production registry dependency closure an end user would download.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { PACKAGES } from './paths.mjs';
import { PUBLISH_STAGE_KEYS, VENDOR_STAGE_KEYS } from './stage-release.mjs';

export { PUBLISH_STAGE_KEYS, VENDOR_STAGE_KEYS };

/**
 * @param {string} dir
 * @param {{ skipNodeModules?: boolean }} [options]
 * @returns {AsyncGenerator<string>}
 */
async function* walkFiles(dir, options = {}) {
	let entries;

	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (options.skipNodeModules === true && entry.name === 'node_modules') {
			continue;
		}

		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			yield* walkFiles(full, options);
			continue;
		}

		if (entry.isFile()) {
			yield full;
		}
	}
}

/**
 * @param {string} root
 * @param {{ skipNodeModules?: boolean }} [options]
 * @returns {Promise<{ bytes: number, gzipBytes: number, fileCount: number }>}
 */
const measureTree = async (root, options = {}) => {
	let bytes = 0;
	let gzipBytes = 0;
	let fileCount = 0;

	for await (const file of walkFiles(root, options)) {
		const buffer = await fs.readFile(file);
		bytes += buffer.byteLength;
		gzipBytes += gzipSync(buffer).byteLength;
		fileCount += 1;
	}

	return { bytes, gzipBytes, fileCount };
};

/**
 * Resolve publishable paths for one staged package (from `package.json` files).
 * CLI skips on-disk `ui-dist` — callers add the UI browser build separately.
 *
 * @param {string} key
 * @returns {Promise<{ name: string, label: string, paths: string[] }>}
 */
export const resolveStagePackagePaths = async (key) => {
	const meta = PACKAGES[key];
	const raw = JSON.parse(
		await fs.readFile(path.join(meta.dir, 'package.json'), 'utf8'),
	);
	const files = Array.isArray(raw.files) ? raw.files : ['dist'];
	const paths = [];

	for (const entry of files) {
		if (key === 'cli' && entry === 'ui-dist') {
			continue;
		}

		const full = path.join(meta.dir, entry);

		try {
			await fs.access(full);
			paths.push(full);
		} catch {
			/* missing optional entry */
		}
	}

	return {
		name: meta.name,
		label: meta.name,
		paths,
	};
};

/**
 * @returns {Promise<Set<string>>}
 */
const workspacePackageNames = async () => {
	const names = new Set();

	for (const key of PUBLISH_STAGE_KEYS) {
		const raw = JSON.parse(
			await fs.readFile(
				path.join(PACKAGES[key].dir, 'package.json'),
				'utf8',
			),
		);
		names.add(raw.name);
	}

	return names;
};

/**
 * @param {import('node:module').NodeRequire} require
 * @param {string} name
 * @returns {string} absolute package root directory
 */
const resolveInstalledPackageDir = (require, name) => {
	try {
		return path.dirname(require.resolve(`${name}/package.json`));
	} catch {
		/* exports may block package.json — fall back to main entry */
	}

	const entry = require.resolve(name);
	let dir = path.dirname(entry);

	while (true) {
		const candidate = path.join(dir, 'package.json');

		if (fsSync.existsSync(candidate)) {
			const pkg = JSON.parse(fsSync.readFileSync(candidate, 'utf8'));

			if (pkg.name === name) {
				return dir;
			}
		}

		const parent = path.dirname(dir);

		if (parent === dir) {
			throw new Error(`Cannot find package root for ${name}`);
		}

		dir = parent;
	}
};

/**
 * Resolve production registry dependency directories from the local install.
 * Dedupes by realpath; skips workspace packages.
 *
 * @returns {Promise<{
 *   dirs: string[],
 *   unresolved: string[],
 * }>}
 */
export const resolveRegistryDepDirs = async () => {
	const workspaceNames = await workspacePackageNames();
	/** @type {Array<{ fromDir: string, name: string }>} */
	const queue = [];
	const seenNames = new Set();
	/** @type {Map<string, string>} realpath → package dir */
	const dirsByRealpath = new Map();
	const unresolved = [];

	for (const key of PUBLISH_STAGE_KEYS) {
		const pkgDir = PACKAGES[key].dir;
		const raw = JSON.parse(
			await fs.readFile(path.join(pkgDir, 'package.json'), 'utf8'),
		);

		for (const name of Object.keys(raw.dependencies ?? {})) {
			if (workspaceNames.has(name) || seenNames.has(name)) {
				continue;
			}

			queue.push({ fromDir: pkgDir, name });
		}
	}

	while (queue.length > 0) {
		const next = queue.pop();

		if (next === undefined) {
			break;
		}

		const { fromDir, name } = next;

		if (workspaceNames.has(name) || seenNames.has(name)) {
			continue;
		}

		seenNames.add(name);

		let packageDir;

		try {
			const require = createRequire(path.join(fromDir, 'package.json'));
			packageDir = resolveInstalledPackageDir(require, name);
		} catch {
			unresolved.push(name);
			continue;
		}

		const packageJsonPath = path.join(packageDir, 'package.json');
		const real = await fs.realpath(packageDir);

		if (!dirsByRealpath.has(real)) {
			dirsByRealpath.set(real, packageDir);
		}

		const depPkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

		for (const child of Object.keys(depPkg.dependencies ?? {})) {
			if (workspaceNames.has(child) || seenNames.has(child)) {
				continue;
			}

			queue.push({ fromDir: packageDir, name: child });
		}
	}

	return {
		dirs: [...dirsByRealpath.values()],
		unresolved,
	};
};

/**
 * Measure the install-local / publish snapshot (workspace packages + UI + deps).
 *
 * @returns {Promise<{
 *   rows: Array<{
 *     label: string,
 *     bytes: number,
 *     gzipBytes: number,
 *     fileCount: number,
 *   }>,
 *   totalBytes: number,
 *   totalGzipBytes: number,
 *   totalFileCount: number,
 *   depsBytes: number,
 *   depsGzipBytes: number,
 *   depsFileCount: number,
 *   depsPackageCount: number,
 *   grandTotalBytes: number,
 *   grandTotalGzipBytes: number,
 *   uiMissing: boolean,
 *   unresolvedDeps: string[],
 * }>}
 */
export const measurePublishSnapshot = async () => {
	const rows = [];

	for (const key of PUBLISH_STAGE_KEYS) {
		const pkg = await resolveStagePackagePaths(key);
		let bytes = 0;
		let gzipBytes = 0;
		let fileCount = 0;

		for (const entryPath of pkg.paths) {
			const part = await measureTree(entryPath);
			bytes += part.bytes;
			gzipBytes += part.gzipBytes;
			fileCount += part.fileCount;
		}

		rows.push({
			label: pkg.label,
			bytes,
			gzipBytes,
			fileCount,
		});
	}

	const uiBrowser = path.join(PACKAGES.ui.dir, 'dist', 'browser');
	let uiMissing = false;

	try {
		await fs.access(path.join(uiBrowser, 'index.html'));
		const ui = await measureTree(uiBrowser);
		rows.push({
			label: 'langflower ui-dist (embedded UI)',
			bytes: ui.bytes,
			gzipBytes: ui.gzipBytes,
			fileCount: ui.fileCount,
		});
	} catch {
		uiMissing = true;
	}

	const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
	const totalGzipBytes = rows.reduce((sum, row) => sum + row.gzipBytes, 0);
	const totalFileCount = rows.reduce((sum, row) => sum + row.fileCount, 0);

	const { dirs: depDirs, unresolved: unresolvedDeps } =
		await resolveRegistryDepDirs();

	let depsBytes = 0;
	let depsGzipBytes = 0;
	let depsFileCount = 0;

	for (const dir of depDirs) {
		// Skip nested node_modules — those packages are counted via the
		// resolved closure (avoids double-counting hoisted/nested copies).
		const part = await measureTree(dir, { skipNodeModules: true });
		depsBytes += part.bytes;
		depsGzipBytes += part.gzipBytes;
		depsFileCount += part.fileCount;
	}

	return {
		rows,
		totalBytes,
		totalGzipBytes,
		totalFileCount,
		depsBytes,
		depsGzipBytes,
		depsFileCount,
		depsPackageCount: depDirs.length,
		grandTotalBytes: totalBytes + depsBytes,
		grandTotalGzipBytes: totalGzipBytes + depsGzipBytes,
		uiMissing,
		unresolvedDeps,
	};
};
