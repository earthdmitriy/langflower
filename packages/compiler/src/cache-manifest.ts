import fs from 'node:fs/promises';
import path from 'node:path';
import {
	cacheManifestPath,
	cacheOutfile,
	cacheRoot,
	packCacheDirName,
	relativeEntryPosix,
} from './cache-paths.js';
import type { DiscoveredPack } from './compile-types.js';
import { HOST_REWRITE_POLICY_ID, fingerprintPack } from './pack-fingerprint.js';
import { hostRuntimeStamp } from './resolve-host-types.js';

export type CachePackRecord = {
	readonly fingerprint: string;
	readonly entries: readonly string[];
};

export type NodesCacheManifest = {
	readonly version: 1;
	readonly policyId: string;
	readonly hostStamp: string;
	readonly packs: Readonly<Record<string, CachePackRecord>>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const parsePackRecord = (value: unknown): CachePackRecord | undefined => {
	if (!isRecord(value) || typeof value.fingerprint !== 'string') {
		return undefined;
	}

	if (!Array.isArray(value.entries)) {
		return undefined;
	}

	const entries: string[] = [];
	for (const entry of value.entries) {
		if (typeof entry !== 'string') {
			return undefined;
		}

		entries.push(entry);
	}

	return { fingerprint: value.fingerprint, entries };
};

const parseManifest = (value: unknown): NodesCacheManifest | undefined => {
	if (!isRecord(value) || value.version !== 1) {
		return undefined;
	}

	if (
		typeof value.policyId !== 'string' ||
		typeof value.hostStamp !== 'string' ||
		!isRecord(value.packs)
	) {
		return undefined;
	}

	const packs: Record<string, CachePackRecord> = {};
	for (const [name, record] of Object.entries(value.packs)) {
		const parsed = parsePackRecord(record);
		if (parsed === undefined) {
			return undefined;
		}

		packs[name] = parsed;
	}

	return {
		version: 1,
		policyId: value.policyId,
		hostStamp: value.hostStamp,
		packs,
	};
};

export const readCacheManifest = async (
	projectDir: string,
): Promise<NodesCacheManifest | undefined> => {
	try {
		const raw = await fs.readFile(cacheManifestPath(projectDir), 'utf8');
		return parseManifest(JSON.parse(raw) as unknown);
	} catch {
		return undefined;
	}
};

export const writeCacheManifest = async (
	projectDir: string,
	manifest: NodesCacheManifest,
): Promise<void> => {
	await fs.mkdir(cacheRoot(projectDir), { recursive: true });
	await fs.writeFile(
		cacheManifestPath(projectDir),
		`${JSON.stringify(manifest, null, '\t')}\n`,
		'utf8',
	);
};

const allOutfilesExist = async (
	projectDir: string,
	pack: DiscoveredPack,
): Promise<boolean> => {
	for (const entryPath of pack.entries) {
		try {
			await fs.access(
				cacheOutfile(
					projectDir,
					pack.packageName,
					pack.packDir,
					entryPath,
				),
			);
		} catch {
			return false;
		}
	}

	return true;
};

export type PackCacheDecision = {
	readonly pack: DiscoveredPack;
	readonly fingerprint: string;
	readonly hit: boolean;
};

export const planPackCache = async (
	projectDir: string,
	packs: readonly DiscoveredPack[],
): Promise<{
	readonly hostStamp: string;
	readonly packs: readonly PackCacheDecision[];
}> => {
	const hostStamp = hostRuntimeStamp();
	const manifest = await readCacheManifest(projectDir);
	const hostOk =
		manifest !== undefined &&
		manifest.policyId === HOST_REWRITE_POLICY_ID &&
		manifest.hostStamp === hostStamp;

	const decisions: PackCacheDecision[] = [];

	for (const pack of packs) {
		const fingerprint = await fingerprintPack(pack);
		const recorded = manifest?.packs[pack.packageName];
		const filesOk = await allOutfilesExist(projectDir, pack);
		const currentEntries = pack.entries
			.map((entryPath) => relativeEntryPosix(pack.packDir, entryPath))
			.sort((left, right) => left.localeCompare(right));
		const recordedEntries = [...(recorded?.entries ?? [])].sort(
			(left, right) => left.localeCompare(right),
		);
		const entriesMatch =
			currentEntries.length === recordedEntries.length &&
			currentEntries.every(
				(entry, index) => entry === recordedEntries[index],
			);
		const hit =
			hostOk &&
			recorded !== undefined &&
			recorded.fingerprint === fingerprint &&
			entriesMatch &&
			filesOk;

		decisions.push({ pack, fingerprint, hit });
	}

	return { hostStamp, packs: decisions };
};

export const deleteVanishedPackDirs = async (
	projectDir: string,
	packs: readonly DiscoveredPack[],
): Promise<void> => {
	const root = cacheRoot(projectDir);
	let entries;

	try {
		entries = await fs.readdir(root, { withFileTypes: true });
	} catch {
		return;
	}

	const keep = new Set(
		packs.map((pack) => packCacheDirName(pack.packageName)),
	);

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}

		if (keep.has(entry.name)) {
			continue;
		}

		await fs.rm(path.join(root, entry.name), {
			recursive: true,
			force: true,
		});
	}
};
