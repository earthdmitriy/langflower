import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DiscoveredPack } from './compile-types.js';
import { relativeEntryPosix } from './cache-paths.js';
import { listPackTsFiles } from './discover-packs.js';
import { hostRuntimeStamp } from './resolve-host-types.js';

/** Bump when host-peer rewrite policy in `bundle-pack.ts` changes. */
export const HOST_REWRITE_POLICY_ID = 'host-peer-file-url-v1';

const PACK_ROOT_HASH_FILES = [
	'package.json',
	'tsconfig.json',
	'package-lock.json',
	'npm-shrinkwrap.json',
	'pnpm-lock.yaml',
	'yarn.lock',
] as const;

const fileExists = async (filePath: string): Promise<boolean> => {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
};

const hashFiles = async (
	packDir: string,
	filePaths: readonly string[],
): Promise<string> => {
	const hash = createHash('sha256');
	const sorted = [...filePaths].sort((left, right) =>
		left.localeCompare(right),
	);

	for (const filePath of sorted) {
		const relative = path
			.relative(packDir, filePath)
			.split(path.sep)
			.join('/');
		const content = await fs.readFile(filePath);
		hash.update(relative);
		hash.update('\0');
		hash.update(content);
		hash.update('\n');
	}

	return hash.digest('hex');
};

export const fingerprintPack = async (
	pack: DiscoveredPack,
): Promise<string> => {
	const tsFiles = await listPackTsFiles(pack.packDir);
	const extra: string[] = [];

	for (const name of PACK_ROOT_HASH_FILES) {
		const full = path.join(pack.packDir, name);
		if (await fileExists(full)) {
			extra.push(full);
		}
	}

	const unique = [...new Set([...tsFiles, ...extra])];
	const filesHash = await hashFiles(pack.packDir, unique);
	const entryKeys = pack.entries
		.map((entryPath) => relativeEntryPosix(pack.packDir, entryPath))
		.sort((left, right) => left.localeCompare(right));
	const stamp = createHash('sha256');
	stamp.update(HOST_REWRITE_POLICY_ID);
	stamp.update('\n');
	stamp.update(hostRuntimeStamp());
	stamp.update('\n');
	stamp.update(filesHash);
	stamp.update('\n');
	stamp.update(entryKeys.join('\n'));

	return stamp.digest('hex');
};
