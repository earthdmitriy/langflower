import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bundleEntry } from './bundle-pack.js';
import { computePackCacheKey } from './cache-key.js';
import type {
	CompilePackError,
	CompileProjectNodesResult,
	DiscoveredPack,
} from './compile-types.js';
import { discoverPacks } from './discover-packs.js';
import { diagnosticsForEntry, typecheckPack } from './typecheck-pack.js';
import { formatCompilePackError } from './format-compilation-errors.js';
import { parseDefaultExport } from './validate-default-export.js';
import {
	deleteCompilationErrorsFile,
	writeCompilationErrorsFile,
} from './write-compilation-errors.js';

const cacheRoot = (projectDir: string): string =>
	path.join(projectDir, '.langflower', '.cache', 'nodes');

const loadBundledDefault = async (
	outfile: string,
	entryPath: string,
	packageName: string,
	projectDir: string,
): Promise<
	| { readonly ok: true; readonly nodes: readonly ReactiveNodeDefinition[] }
	| { readonly ok: false; readonly error: CompilePackError }
> => {
	const href = `${pathToFileURL(outfile).href}?t=${Date.now()}`;

	try {
		const mod: unknown = await import(href);
		const defaultExport =
			typeof mod === 'object' && mod !== null && 'default' in mod
				? mod.default
				: undefined;
		const parsed = parseDefaultExport(defaultExport, entryPath);

		if (!parsed.ok) {
			return {
				ok: false,
				error: formatCompilePackError(
					packageName,
					[parsed.diagnostic],
					projectDir,
				),
			};
		}

		return { ok: true, nodes: parsed.nodes };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			ok: false,
			error: formatCompilePackError(
				packageName,
				[
					{
						file: entryPath,
						message: `Failed to load bundled module: ${message}`,
					},
				],
				projectDir,
			),
		};
	}
};

const relativeEntry = (packDir: string, entryPath: string): string =>
	path.relative(packDir, entryPath).split(path.sep).join('/');

const compileEntry = async (
	projectDir: string,
	pack: DiscoveredPack,
	entryPath: string,
): Promise<
	| { readonly ok: true; readonly nodes: readonly ReactiveNodeDefinition[] }
	| { readonly ok: false; readonly error: CompilePackError }
> => {
	const cacheKey = await computePackCacheKey(pack.packDir, [entryPath]);
	const relative = relativeEntry(pack.packDir, entryPath).replace(
		/[\\/]/g,
		'__',
	);
	const outfile = path.join(
		cacheRoot(projectDir),
		pack.packageName.replace(/[^\w.-]+/g, '_'),
		cacheKey,
		`${relative}.mjs`,
	);

	const bundled = await bundleEntry({
		entryPath,
		packDir: pack.packDir,
		outfile,
	});

	if (!bundled.ok) {
		return {
			ok: false,
			error: formatCompilePackError(
				pack.packageName,
				bundled.diagnostics,
				projectDir,
			),
		};
	}

	return loadBundledDefault(
		bundled.outfile,
		entryPath,
		pack.packageName,
		projectDir,
	);
};

/**
 * Compile one pack: typecheck (when tsconfig present), then esbuild only
 * entries that passed. Sibling entries and other packs are independent.
 */
const compilePack = async (
	projectDir: string,
	pack: DiscoveredPack,
): Promise<{
	readonly nodes: readonly ReactiveNodeDefinition[];
	readonly errors: readonly CompilePackError[];
}> => {
	if (pack.entries.length === 0) {
		await deleteCompilationErrorsFile(pack.packDir);
		return { nodes: [], errors: [] };
	}

	const typecheck = typecheckPack(pack.packDir, pack.entries);
	const nodes: ReactiveNodeDefinition[] = [];
	const errors: CompilePackError[] = [];

	for (const entryPath of pack.entries) {
		const tscDiagnostics = diagnosticsForEntry(typecheck, entryPath);

		if (tscDiagnostics.length > 0) {
			errors.push(
				formatCompilePackError(
					pack.packageName,
					tscDiagnostics,
					projectDir,
				),
			);
			continue;
		}

		const compiled = await compileEntry(projectDir, pack, entryPath);

		if (!compiled.ok) {
			errors.push(compiled.error);
			continue;
		}

		nodes.push(...compiled.nodes);
	}

	await writeCompilationErrorsFile(pack.packDir, pack.packageName, errors);

	return { nodes, errors };
};

/**
 * True when `.langflower/nodes/` has at least one pack directory.
 */
export const hasCustomNodePacks = async (
	projectDir: string,
): Promise<boolean> => {
	const packs = await discoverPacks(projectDir);
	return packs.length > 0;
};

/**
 * Scan `.langflower/nodes/`. Each pack runs independently; within a pack each
 * `export default` entry is typechecked then esbuilt only if clean.
 * Returns all successful definitions plus all failures (partial success OK).
 * Empty / missing `nodes/` is a no-op (no cache dir).
 */
export const compileProjectNodes = async (
	projectDir: string,
): Promise<CompileProjectNodesResult> => {
	const packs = await discoverPacks(projectDir);

	if (packs.length === 0) {
		return { nodes: [], errors: [] };
	}

	await fs.mkdir(cacheRoot(projectDir), { recursive: true });

	const nodes: ReactiveNodeDefinition[] = [];
	const errors: CompilePackError[] = [];

	for (const pack of packs) {
		const result = await compilePack(projectDir, pack);
		nodes.push(...result.nodes);
		errors.push(...result.errors);
	}

	return { nodes, errors };
};

export type {
	CompileDiagnostic,
	CompilePackError,
	CompileProjectNodesResult,
} from './compile-types.js';
