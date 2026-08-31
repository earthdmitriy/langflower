import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import fs from 'node:fs/promises';
import { bundleEntry } from './bundle-pack.js';
import {
	deleteVanishedPackDirs,
	planPackCache,
	writeCacheManifest,
	type CachePackRecord,
} from './cache-manifest.js';
import {
	cacheOutfile,
	cacheRoot,
	packCacheDir,
	relativeEntryPosix,
} from './cache-paths.js';
import { wipeCacheRoot, wipePathOrCacheRoot } from './cache-wipe.js';
import type {
	CompilePackError,
	CompileProjectNodesOptions,
	CompileProjectNodesResult,
	DiscoveredPack,
} from './compile-types.js';
import { discoverPacks } from './discover-packs.js';
import { formatCompilePackError } from './format-compilation-errors.js';
import { loadBundledDefault, loadPackFromCache } from './load-cached-nodes.js';
import { HOST_REWRITE_POLICY_ID, fingerprintPack } from './pack-fingerprint.js';
import { hostRuntimeStamp } from './resolve-host-types.js';
import { diagnosticsForEntry, typecheckPack } from './typecheck-pack.js';
import {
	deleteCompilationErrorsFile,
	writeCompilationErrorsFile,
} from './write-compilation-errors.js';

const compileEntry = async (
	projectDir: string,
	pack: DiscoveredPack,
	entryPath: string,
): Promise<
	| { readonly ok: true; readonly nodes: readonly ReactiveNodeDefinition[] }
	| { readonly ok: false; readonly error: CompilePackError }
> => {
	const outfile = cacheOutfile(
		projectDir,
		pack.packageName,
		pack.packDir,
		entryPath,
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

const packRecord = (
	pack: DiscoveredPack,
	fingerprint: string,
): CachePackRecord => ({
	fingerprint,
	entries: pack.entries.map((entryPath) =>
		relativeEntryPosix(pack.packDir, entryPath),
	),
});

export { hasCustomNodePacks } from './discover-packs.js';

/**
 * Scan `.langflower/nodes/`. Each pack runs independently; within a pack each
 * `export default` entry is typechecked then esbuilt only if clean.
 * Returns all successful definitions plus all failures (partial success OK).
 *
 * Incremental by default: matching fingerprints load existing `.mjs` files.
 * `{ force: true }` wipes `.langflower/.cache/nodes/` then compiles every pack.
 * Empty / missing `nodes/` deletes leftover cache and does not recreate it.
 */
export const compileProjectNodes = async (
	projectDir: string,
	options?: CompileProjectNodesOptions,
): Promise<CompileProjectNodesResult> => {
	const packs = await discoverPacks(projectDir);
	const force = options?.force === true;

	if (packs.length === 0) {
		const wiped = await wipeCacheRoot(projectDir);
		if (!wiped.ok) {
			return { nodes: [], errors: [wiped.error] };
		}

		return { nodes: [], errors: [] };
	}

	if (force) {
		const wiped = await wipeCacheRoot(projectDir);
		if (!wiped.ok) {
			return { nodes: [], errors: [wiped.error] };
		}
	} else {
		await deleteVanishedPackDirs(projectDir, packs);
	}

	await fs.mkdir(cacheRoot(projectDir), { recursive: true });

	const plan = force
		? {
				hostStamp: hostRuntimeStamp(),
				packs: await Promise.all(
					packs.map(async (pack) => ({
						pack,
						fingerprint: await fingerprintPack(pack),
						hit: false as const,
					})),
				),
			}
		: await planPackCache(projectDir, packs);

	const nodes: ReactiveNodeDefinition[] = [];
	const errors: CompilePackError[] = [];
	const nextPacks: Record<string, CachePackRecord> = {};

	for (const decision of plan.packs) {
		if (decision.hit) {
			const loaded = await loadPackFromCache(projectDir, decision.pack);
			if (loaded.ok) {
				nodes.push(...loaded.nodes);
				nextPacks[decision.pack.packageName] = packRecord(
					decision.pack,
					decision.fingerprint,
				);
				continue;
			}
		}

		const packDir = packCacheDir(projectDir, decision.pack.packageName);
		const cleared = await wipePathOrCacheRoot(projectDir, packDir);
		if (!cleared.ok) {
			return { nodes, errors: [...errors, cleared.error] };
		}

		if (cleared.wipedRoot && !force) {
			return compileProjectNodes(projectDir, { force: true });
		}

		if (cleared.wipedRoot) {
			await fs.mkdir(cacheRoot(projectDir), { recursive: true });
		}

		const result = await compilePack(projectDir, decision.pack);
		nodes.push(...result.nodes);
		errors.push(...result.errors);

		if (result.errors.length === 0) {
			nextPacks[decision.pack.packageName] = packRecord(
				decision.pack,
				decision.fingerprint,
			);
		}
	}

	await writeCacheManifest(projectDir, {
		version: 1,
		policyId: HOST_REWRITE_POLICY_ID,
		hostStamp: plan.hostStamp,
		packs: nextPacks,
	});

	return { nodes, errors };
};

export type {
	CompileDiagnostic,
	CompilePackError,
	CompileProjectNodesOptions,
	CompileProjectNodesResult,
} from './compile-types.js';
