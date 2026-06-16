import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/**
 * Host peers supplied by the Langflower install tree (not the user project).
 * Kept external at bundle time; types + runtime entries resolve from here.
 */
const HOST_PEER_PACKAGES = [
	'@langflower/node-sdk',
	'rxjs',
	'@rx-evo/stateful-observable',
] as const;
type PackageJson = {
	readonly name?: string;
	readonly types?: string;
	readonly typings?: string;
	readonly exports?: unknown;
};

const asRecord = (
	value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: undefined;

const toPosix = (filePath: string): string =>
	filePath.split(path.sep).join('/');

/**
 * Walk up from a resolved module file until a package.json is found.
 * Works when the package does not export `./package.json`.
 */
const findPackageRoot = (fromFile: string): string | undefined => {
	let dir = path.dirname(fromFile);
	for (;;) {
		const candidate = path.join(dir, 'package.json');
		if (fs.existsSync(candidate)) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
};

const resolvePackageEntry = (specifier: string): string | undefined => {
	try {
		return fileURLToPath(import.meta.resolve(specifier));
	} catch {
		try {
			return require.resolve(specifier);
		} catch {
			return undefined;
		}
	}
};

/**
 * True for bare host peer names and their subpaths
 * (`@langflower/node-sdk/llm`, …).
 */
export const isHostPeerSpecifier = (id: string): boolean => {
	for (const name of HOST_PEER_PACKAGES) {
		if (id === name || id.startsWith(`${name}/`)) {
			return true;
		}
	}

	return false;
};

/**
 * Resolve the JS runtime entry for a host peer (or subpath) from the
 * compiler's install tree. Works with `npm i -g` and an empty project.
 */
export const resolveHostPackageEntry = (
	specifier: string,
): string | undefined => resolvePackageEntry(specifier);

/**
 * Stable stamp of resolved host peer roots for cache invalidation when the
 * Langflower install tree moves or upgrades.
 */
export const hostRuntimeEntryStamp = (): string =>
	HOST_PEER_PACKAGES.map((name) => {
		const entry = resolveHostPackageEntry(name);
		return `${name}=${entry === undefined ? '' : toPosix(entry)}`;
	}).join('\n');

/**
 * Prefer `exports` types conditions (import → require → default), then
 * top-level `types` / `typings`.
 */
const typesFromExportTarget = (target: unknown): string | undefined => {
	if (typeof target === 'string') {
		return target.endsWith('.d.ts') || target.endsWith('.d.cts')
			? target
			: undefined;
	}

	const record = asRecord(target);
	if (record === undefined) {
		return undefined;
	}

	if (typeof record.types === 'string') {
		return record.types;
	}

	for (const key of ['import', 'require', 'default', 'node'] as const) {
		const nested = typesFromExportTarget(record[key]);
		if (nested !== undefined) {
			return nested;
		}
	}

	return undefined;
};

const typesFromExportsField = (exportsField: unknown): string | undefined => {
	if (exportsField === undefined) {
		return undefined;
	}

	if (typeof exportsField === 'string') {
		return typesFromExportTarget(exportsField);
	}

	const record = asRecord(exportsField);
	if (record === undefined) {
		return undefined;
	}

	if ('.' in record) {
		return typesFromExportTarget(record['.']);
	}

	return typesFromExportTarget(record);
};

const readPackageJson = (packageRoot: string): PackageJson | undefined => {
	try {
		const raw = fs.readFileSync(
			path.join(packageRoot, 'package.json'),
			'utf8',
		);
		return JSON.parse(raw) as PackageJson;
	} catch {
		return undefined;
	}
};

const resolveTypesRelative = (
	packageRoot: string,
	relative: string,
): string | undefined => {
	const absolute = path.resolve(packageRoot, relative);
	return fs.existsSync(absolute) ? absolute : undefined;
};

/**
 * Resolve declaration entry for a host package installed next to the
 * compiler (global Langflower tree), using package.json `types` /
 * `exports.types` — not a `.js` → `.d.ts` sibling guess.
 */
export const resolveHostPackageTypes = (
	specifier: string,
): string | undefined => {
	const entry = resolvePackageEntry(specifier);
	if (entry === undefined) {
		return undefined;
	}

	const packageRoot = findPackageRoot(entry);
	if (packageRoot === undefined) {
		return undefined;
	}

	const pkg = readPackageJson(packageRoot);
	if (pkg === undefined) {
		return undefined;
	}

	const fromExports = typesFromExportsField(pkg.exports);
	if (fromExports !== undefined) {
		const resolved = resolveTypesRelative(packageRoot, fromExports);
		if (resolved !== undefined) {
			return resolved;
		}
	}

	const fromTypes = pkg.types ?? pkg.typings;
	if (typeof fromTypes === 'string') {
		const resolved = resolveTypesRelative(packageRoot, fromTypes);
		if (resolved !== undefined) {
			return resolved;
		}
	}

	const fallback = path.join(packageRoot, 'index.d.ts');
	return fs.existsSync(fallback) ? fallback : undefined;
};

/**
 * Map bare host peer names → absolute `.d.ts` paths for tsc `paths`.
 * Resolved from the compiler's own install tree (works with `npm i -g`
 * and a project folder that has no `node_modules`).
 */
export const hostPathMappings = (): Record<string, string[]> => {
	const mappings: Record<string, string[]> = {};

	for (const name of HOST_PEER_PACKAGES) {
		const typesPath = resolveHostPackageTypes(name);
		if (typesPath === undefined) {
			continue;
		}
		mappings[name] = [toPosix(typesPath)];
	}

	return mappings;
};

/**
 * `typeRoots` folder that contains `@types/*` packages, resolved from the
 * compiler host (not the user project / monorepo layout).
 */
export const resolveHostTypeRoots = (): string[] => {
	try {
		const typesNodePkg = require.resolve('@types/node/package.json');
		// …/node_modules/@types/node/package.json → …/node_modules/@types
		return [path.dirname(path.dirname(typesNodePkg))];
	} catch {
		return [];
	}
};
