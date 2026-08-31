import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import {
	deleteVanishedPackDirs,
	planPackCache,
	readCacheManifest,
	writeCacheManifest,
} from './cache-manifest.js';
import type {
	LoadProjectNodesOptions,
	LoadProjectNodesResult,
} from './compile-types.js';
import { discoverPacks } from './discover-packs.js';
import { loadPackFromCache } from './load-cached-nodes.js';
import { wipeCacheRoot } from './cache-wipe.js';
import { HOST_REWRITE_POLICY_ID } from './pack-fingerprint.js';

export type {
	LoadProjectNodesOptions,
	LoadProjectNodesResult,
} from './compile-types.js';

const compileDirty = async (
	projectDir: string,
	options: LoadProjectNodesOptions | undefined,
	force: boolean,
): Promise<LoadProjectNodesResult> => {
	options?.onCompile?.();
	const { compileProjectNodes } = await import('./compile-project-nodes.js');
	const result = await compileProjectNodes(projectDir, { force });
	return { ...result, compiled: true };
};

/**
 * Load project custom nodes from cache when fingerprints match the host
 * stamp; otherwise compile dirty packs. Does not statically import
 * `typescript` or esbuild.
 */
export const loadProjectNodes = async (
	projectDir: string,
	options?: LoadProjectNodesOptions,
): Promise<LoadProjectNodesResult> => {
	const packs = await discoverPacks(projectDir);

	if (packs.length === 0) {
		const wiped = await wipeCacheRoot(projectDir);
		if (!wiped.ok) {
			return { nodes: [], errors: [wiped.error], compiled: false };
		}

		return { nodes: [], errors: [], compiled: false };
	}

	if (options?.force === true) {
		return compileDirty(projectDir, options, true);
	}

	const plan = await planPackCache(projectDir, packs);
	await deleteVanishedPackDirs(projectDir, packs);

	if (!plan.packs.every((decision) => decision.hit)) {
		return compileDirty(projectDir, options, false);
	}

	const nodes: ReactiveNodeDefinition[] = [];

	for (const decision of plan.packs) {
		const loaded = await loadPackFromCache(projectDir, decision.pack);
		if (!loaded.ok) {
			return compileDirty(projectDir, options, false);
		}

		nodes.push(...loaded.nodes);
	}

	const manifest = await readCacheManifest(projectDir);
	const keep = new Set(packs.map((pack) => pack.packageName));
	if (
		manifest !== undefined &&
		Object.keys(manifest.packs).some((name) => !keep.has(name))
	) {
		const packsRecord = Object.fromEntries(
			Object.entries(manifest.packs).filter(([name]) => keep.has(name)),
		);
		await writeCacheManifest(projectDir, {
			version: 1,
			policyId: HOST_REWRITE_POLICY_ID,
			hostStamp: plan.hostStamp,
			packs: packsRecord,
		});
	}

	return { nodes, errors: [], compiled: false };
};
