import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bundleEntry } from './bundle-pack.js';
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

const wipeCacheRoot = async (
	projectDir: string,
): Promise<
	| { readonly ok: true }
	| { readonly ok: false; readonly error: CompilePackError }
> => {
	try {
		await fs.rm(cacheRoot(projectDir), { recursive: true, force: true });
		return { ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			ok: false,
			error: formatCompilePackError(
				'.cache/nodes',
				[
					{
						message: `Failed to delete custom-node cache: ${message}`,
					},
				],
				projectDir,
			),
		};
	}
};

const loadBundledDefault = async (
	outfile: string,
	entryPath: string,
	packageName: string,
	projectDir: string,
): Promise<
	| { readonly ok: true; readonly nodes: readonly ReactiveNodeDefinition[] }
	| { readonly ok: false; readonly error: CompilePackError }
> => {
	const loadFile = path.join(
		os.tmpdir(),
		`lf-node-load-${process.hrtime.bigint()}.mjs`,
	);

	try {
		// Stable outfile stays at `<pack>/<entry>.mjs` for git diff. Import a
		// unique temp copy so Node / Vitest ESM cache cannot reuse the previous
		// module for that path (query strings are not enough under Vitest).
		await fs.copyFile(outfile, loadFile);
		const href = `${pathToFileURL(loadFile).href}?t=${Date.now()}`;
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
	const relative = relativeEntry(pack.packDir, entryPath)
		.replace(/[\\/]/g, '__')
		.replace(/\.tsx$/u, '')
		.replace(/\.ts$/u, '');
	const outfile = path.join(
		cacheRoot(projectDir),
		pack.packageName.replace(/[^\w.-]+/g, '_'),
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
 * Always deletes `.langflower/.cache/nodes/` first. Empty / missing `nodes/`
 * does not recreate the cache dir.
 */
export const compileProjectNodes = async (
	projectDir: string,
): Promise<CompileProjectNodesResult> => {
	const packs = await discoverPacks(projectDir);
	const wiped = await wipeCacheRoot(projectDir);

	if (!wiped.ok) {
		return { nodes: [], errors: [wiped.error] };
	}

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
