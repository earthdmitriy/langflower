/**
 * Shared staging for install-local and pack-release.
 *
 * CLI is esbuild-bundled into product `dist/` (eval / compile split chunks;
 * typescript + esbuild + host peers external). CLI bin + UI browser build
 * → product root (`langflower`).
 *
 * Product `vendor/` is **not** a copy of every workspace `tsc` tree. Server,
 * catalog, compiler, and the rest are concatenated into `dist/`. Only host
 * peers (`node-sdk`, `runtime`) stay real packages so custom-pack `file://`
 * identity matches the process (BUG-2026-07-28). Bootstrap seed files live
 * at `vendor/server/skeleton/` (no server `dist/`).
 *
 * Registry production deps of the inlined workspace packages + CLI are still
 * hoisted onto the published root `langflower` package.json (`openai`,
 * `express`, `typescript`, …). Nested `file:./vendor/…` packages alone do
 * not reliably install those deps for global/registry installs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, PACKAGES } from './paths.mjs';
import { log } from './logger.mjs';
import { bundleProductCli } from './bundle-product.mjs';

const TSCONFIG_BASE = path.join(ROOT, 'tsconfig.base.json');
const RELEASE_DIR = path.join(ROOT, '.release');
const TSCONFIG_BASE_BACKUP = path.join(
	RELEASE_DIR,
	'tsconfig.base.json.backup',
);

/** User manuals shipped in the published tarball (`package.json` files). */
export const PUBLISH_DOCS_DIR = 'docs/public';

/** Paths included in the published `langflower` tarball (`package.json` files). */
export const PUBLISH_FILES = [
	'dist',
	'bin',
	'ui-dist',
	'vendor',
	PUBLISH_DOCS_DIR,
];

/**
 * Manuals linked from the root README.md — must be present in the npm pack.
 * (README.md itself is always included by npm.)
 */
export const README_REFERENCED_DOCS = [
	'docs/public/README.md',
	'docs/public/getting-started.md',
	'docs/public/product.md',
	'docs/public/using-the-editor.md',
	'docs/public/workflows.md',
	'docs/public/configuration.md',
	'docs/public/extending.md',
	'docs/public/how-it-works.md',
];

/**
 * Copy shipped user manuals into a staged product tree (install-local).
 * No-op when staging at the repo root — those paths already exist for pack.
 *
 * @param {string} productDir
 */
const copyPublishDocs = async (productDir) => {
	if (path.resolve(productDir) === path.resolve(ROOT)) {
		return;
	}

	const docsSrc = path.join(ROOT, PUBLISH_DOCS_DIR);
	const docsDest = path.join(productDir, PUBLISH_DOCS_DIR);
	await fs.mkdir(path.dirname(docsDest), { recursive: true });
	await fs.cp(docsSrc, docsDest, { recursive: true });
	await fs.cp(
		path.join(ROOT, 'README.md'),
		path.join(productDir, 'README.md'),
	);

	log.info(`Publish docs → ${path.relative(ROOT, docsDest)}`);
};

const isSourcemapPath = (filePath) => filePath.endsWith('.map');

/**
 * Temporarily disable sourceMap / declarationMap in tsconfig.base.json for a
 * release build, then restore the backup in `finally`. `tsc` does not delete
 * leftover `*.map` from a previous `sourceMap: true` workspace build — vendor
 * copy skips those files and `stripSourceMaps` still walks staged trees.
 *
 * @param {() => Promise<void>} fn
 */
export const withReleaseSourcemapsOff = async (fn) => {
	await fs.mkdir(RELEASE_DIR, { recursive: true });
	await fs.copyFile(TSCONFIG_BASE, TSCONFIG_BASE_BACKUP);
	log.info(
		`Backed up tsconfig.base.json → ${path.relative(ROOT, TSCONFIG_BASE_BACKUP)}`,
	);

	try {
		const raw = JSON.parse(await fs.readFile(TSCONFIG_BASE, 'utf8'));
		const compilerOptions = {
			...(raw.compilerOptions ?? {}),
			sourceMap: false,
			declarationMap: false,
		};
		await fs.writeFile(
			TSCONFIG_BASE,
			`${JSON.stringify({ ...raw, compilerOptions }, null, '\t')}\n`,
			'utf8',
		);
		log.info('Release build: sourceMap/declarationMap disabled');
		await fn();
	} finally {
		await fs.copyFile(TSCONFIG_BASE_BACKUP, TSCONFIG_BASE);
		log.info('Restored tsconfig.base.json from backup');
	}
};

/**
 * Recursively delete leftover `*.map` under `dir`. Product CLI `dist/` is
 * esbuild with `sourcemap: false`; this walk is for unbundled vendor / UI
 * trees after a skip-on-copy filter.
 *
 * @param {string} dir
 */
export const stripSourceMaps = async (dir) => {
	let removed = 0;

	const walk = async (current) => {
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith('.map')) {
				await fs.unlink(full);
				removed += 1;
			}
		}
	};

	await walk(dir);
	if (removed > 0) {
		log.info(
			`Stripped ${removed} leftover sourcemap file(s) from ${path.relative(ROOT, dir) || '.'}`,
		);
	}
};

/**
 * Workspace packages whose JS used to ship under `vendor/`. After product
 * bundling their emit is concatenated into `dist/`; this list still feeds
 * registry-dep hoist and the publish-snapshot npm closure walk.
 */
export const WORKSPACE_PRODUCT_DEP_KEYS = [
	'runtime',
	'tools',
	'eval',
	'nodeSdk',
	'compiler',
	'commonNodes',
	'websocketBridge',
	'shared',
	'server',
];

/**
 * Host-peer packages copied into product `vendor/` as real packages.
 * Custom packs `file://`-rewrite to these trees; the bundled CLI also
 * imports them (they are esbuild externals).
 */
export const VENDOR_STAGE_KEYS = ['runtime', 'nodeSdk'];

/** @deprecated snapshot / registry walk — not what `assembleProduct` copies */
export const PUBLISH_STAGE_KEYS = [...WORKSPACE_PRODUCT_DEP_KEYS, 'cli'];

/** Packages whose production registry deps must be installable with the product. */
const REGISTRY_DEP_SOURCE_KEYS = [...WORKSPACE_PRODUCT_DEP_KEYS, 'cli'];

const packageDirName = (key) => path.basename(PACKAGES[key].dir);

const nameToVendorDir = Object.fromEntries(
	VENDOR_STAGE_KEYS.map((key) => [PACKAGES[key].name, packageDirName(key)]),
);

const workspacePackageNameSet = () =>
	new Set(Object.values(PACKAGES).map((meta) => meta.name));

/**
 * Collect direct registry (non-workspace) production dependencies from the
 * workspace packages that feed the product (inlined JS + host peers) and the
 * CLI. First-seen version wins; conflicts are logged.
 *
 * @returns {Promise<Record<string, string>>}
 */
export const collectRegistryDependencies = async () => {
	const workspaceNames = workspacePackageNameSet();
	/** @type {Record<string, string>} */
	const deps = {};

	for (const key of REGISTRY_DEP_SOURCE_KEYS) {
		const meta = PACKAGES[key];
		const raw = JSON.parse(
			await fs.readFile(path.join(meta.dir, 'package.json'), 'utf8'),
		);

		for (const [name, version] of Object.entries(raw.dependencies ?? {})) {
			if (workspaceNames.has(name)) {
				continue;
			}
			if (typeof version !== 'string' || version.startsWith('file:')) {
				continue;
			}
			if (deps[name] !== undefined && deps[name] !== version) {
				log.warn(
					`Registry dep ${name}: keeping ${deps[name]} (also ${version} from ${meta.name})`,
				);
				continue;
			}
			deps[name] = version;
		}
	}

	return deps;
};

export const runCommand = (command, args, cwd = ROOT) =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env: process.env,
			shell: true,
			stdio: 'inherit',
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(`${command} ${args.join(' ')} exited with ${code}`),
			);
		});
	});

const rewriteVendorDeps = (deps) => {
	if (deps === undefined || deps === null) {
		return undefined;
	}
	return Object.fromEntries(
		Object.entries(deps).map(([name, version]) => {
			const dir = nameToVendorDir[name];
			if (dir === undefined) {
				return [name, version];
			}
			return [name, `file:../${dir}`];
		}),
	);
};

const stagePackageJson = (raw) => {
	const {
		private: _private,
		devDependencies: _devDependencies,
		scripts: _scripts,
		...rest
	} = raw;
	const dependencies = rewriteVendorDeps(raw.dependencies);
	return {
		...rest,
		...(dependencies !== undefined ? { dependencies } : {}),
	};
};

const copyListedFiles = async (sourceDir, destDir, files) => {
	await fs.mkdir(destDir, { recursive: true });
	for (const entry of files) {
		const from = path.join(sourceDir, entry);
		const to = path.join(destDir, entry);
		try {
			await fs.access(from);
		} catch {
			log.warn(
				`Skipping missing ${entry} in ${path.basename(sourceDir)}`,
			);
			continue;
		}
		await fs.cp(from, to, {
			recursive: true,
			filter: (source) => !isSourcemapPath(source),
		});
	}
};

const stageVendorPackage = async (key, vendorRoot) => {
	const meta = PACKAGES[key];
	const dirName = packageDirName(key);
	const destDir = path.join(vendorRoot, dirName);
	const raw = JSON.parse(
		await fs.readFile(path.join(meta.dir, 'package.json'), 'utf8'),
	);
	const files = Array.isArray(raw.files) ? raw.files : ['dist'];

	await copyListedFiles(meta.dir, destDir, files);
	await fs.writeFile(
		path.join(destDir, 'package.json'),
		`${JSON.stringify(stagePackageJson(raw), null, '\t')}\n`,
		'utf8',
	);
	log.info(`Staged ${meta.name} → vendor/${dirName}`);
};

const stageServerSkeleton = async (vendorRoot) => {
	const from = await assertServerSkeleton();
	const to = path.join(vendorRoot, 'server', 'skeleton');
	await fs.cp(from, to, {
		recursive: true,
		filter: (source) => !isSourcemapPath(source),
	});
	log.info('Staged server skeleton → vendor/server/skeleton');
};

/**
 * Host peers + bootstrap skeleton only. Inlined workspace `tsc` trees
 * (server, common-nodes, compiler, …) stay out of `vendor/`.
 *
 * @param {string} vendorRoot
 */
export const stageProductVendor = async (vendorRoot) => {
	await fs.mkdir(vendorRoot, { recursive: true });
	for (const key of VENDOR_STAGE_KEYS) {
		await stageVendorPackage(key, vendorRoot);
	}
	await stageServerSkeleton(vendorRoot);
};

const assertUiBuild = async () => {
	const uiBrowser = path.join(PACKAGES.ui.dir, 'dist', 'browser');
	try {
		await fs.access(path.join(uiBrowser, 'index.html'));
	} catch {
		throw new Error(
			`UI build missing at ${uiBrowser}. Run a full build first.`,
		);
	}
	return uiBrowser;
};

const assertServerSkeleton = async () => {
	const skeleton = path.join(PACKAGES.server.dir, 'skeleton');
	try {
		await fs.access(skeleton);
	} catch {
		throw new Error(`Server skeleton missing at ${skeleton}`);
	}
	return skeleton;
};

const assertCliDist = async () => {
	const indexJs = path.join(PACKAGES.cli.dir, 'dist', 'index.js');
	try {
		await fs.access(indexJs);
	} catch {
		throw new Error(
			`CLI build missing at ${indexJs}. Run a full build first.`,
		);
	}
};

/**
 * Read root package.json and return a publish-ready manifest with host-peer
 * vendor file: deps plus hoisted registry production deps from inlined
 * workspace packages and the CLI.
 */
export const buildPublishPackageJson = async () => {
	const raw = JSON.parse(
		await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'),
	);

	const vendorDeps = Object.fromEntries(
		VENDOR_STAGE_KEYS.map((key) => [
			PACKAGES[key].name,
			`file:./vendor/${packageDirName(key)}`,
		]),
	);

	const registryDeps = await collectRegistryDependencies();

	const dependencies = {
		...vendorDeps,
		...registryDeps,
	};

	return {
		name: 'langflower',
		version: raw.version ?? '0.1.0',
		description:
			raw.description ??
			'Visual LLM-chain builder — locally-run web application',
		type: 'module',
		bin: {
			langflower: './bin/langflower.js',
		},
		main: './dist/index.js',
		files: [...PUBLISH_FILES],
		engines: raw.engines ?? { node: '>=22.22.3' },
		dependencies,
		keywords: raw.keywords ?? ['llm', 'workflow', 'visual-editor'],
		license: raw.license ?? 'MIT',
	};
};

/**
 * Assemble a product directory: dist, bin, ui-dist, vendor, docs/public,
 * package.json.
 *
 * @param {string} productDir absolute path (repo root or .local-install/langflower)
 * @param {{ writePackageJson?: boolean, packageJson?: object }} [options]
 */
export const assembleProduct = async (productDir, options = {}) => {
	const writePackageJson = options.writePackageJson !== false;
	await assertCliDist();
	await assertServerSkeleton();
	const uiBrowser = await assertUiBuild();

	const vendorRoot = path.join(productDir, 'vendor');
	await fs.rm(vendorRoot, { recursive: true, force: true });
	await stageProductVendor(vendorRoot);

	const distDest = path.join(productDir, 'dist');
	const binDest = path.join(productDir, 'bin');
	const uiDest = path.join(productDir, 'ui-dist');

	await fs.rm(distDest, { recursive: true, force: true });
	await fs.rm(uiDest, { recursive: true, force: true });
	await bundleProductCli({
		entryIndex: path.join(PACKAGES.cli.dir, 'dist', 'index.js'),
		outdir: distDest,
	});
	await fs.mkdir(binDest, { recursive: true });
	await fs.cp(
		path.join(PACKAGES.cli.dir, 'bin', 'langflower.js'),
		path.join(binDest, 'langflower.js'),
	);
	await fs.cp(uiBrowser, uiDest, {
		recursive: true,
		filter: (source) => !isSourcemapPath(source),
	});

	log.info(`Embedded UI → ${path.relative(ROOT, uiDest)}`);
	log.info(`CLI bin + bundled dist → ${path.relative(ROOT, productDir)}`);

	await copyPublishDocs(productDir);

	// Product `dist/` is esbuild with `sourcemap: false`. Vendor is host
	// peers + skeleton (skip `*.map` on copy); walk as a safety net.
	for (const name of ['vendor', 'ui-dist']) {
		await stripSourceMaps(path.join(productDir, name));
	}

	if (writePackageJson) {
		const pkg = options.packageJson ?? (await buildPublishPackageJson());
		await fs.writeFile(
			path.join(productDir, 'package.json'),
			`${JSON.stringify(pkg, null, '\t')}\n`,
			'utf8',
		);
	}
};

/**
 * @param {{ build?: boolean }} [options]
 */
export const buildAllIfNeeded = async (options = {}) => {
	if (options.build === false) {
		return;
	}
	log.step('Building all packages (release: sourcemaps off)');
	await withReleaseSourcemapsOff(async () => {
		await runCommand('node', ['build/build-all.mjs']);
	});
};
