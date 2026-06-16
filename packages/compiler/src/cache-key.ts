import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hostRuntimeEntryStamp } from './resolve-host-types.js';

/** Bump when host-peer rewrite policy changes (busts bare-import caches). */
const HOST_PEER_RUNTIME_POLICY = 'host-peer-runtime:file-url-v1';

const hashText = (text: string): string =>
	createHash('sha256').update(text).digest('hex');

const readOptionalFile = async (filePath: string): Promise<string> => {
	try {
		return await fs.readFile(filePath, 'utf8');
	} catch {
		return '';
	}
};

/**
 * Cache key inputs: entry sources + pack `package.json` + lockfile when present
 * + host peer runtime stamp (so empty-project peer rewrite upgrades invalidate).
 */
export const computePackCacheKey = async (
	packDir: string,
	entries: readonly string[],
): Promise<string> => {
	const parts: string[] = [];

	for (const entry of [...entries].sort()) {
		const relative = path
			.relative(packDir, entry)
			.split(path.sep)
			.join('/');
		const source = await fs.readFile(entry, 'utf8');
		parts.push(`${relative}\n${source}`);
	}

	parts.push(
		`package.json\n${await readOptionalFile(path.join(packDir, 'package.json'))}`,
	);
	parts.push(
		`package-lock.json\n${await readOptionalFile(path.join(packDir, 'package-lock.json'))}`,
	);
	parts.push(
		`npm-shrinkwrap.json\n${await readOptionalFile(path.join(packDir, 'npm-shrinkwrap.json'))}`,
	);
	parts.push(`${HOST_PEER_RUNTIME_POLICY}\n${hostRuntimeEntryStamp()}`);

	return hashText(parts.join('\n---\n'));
};
