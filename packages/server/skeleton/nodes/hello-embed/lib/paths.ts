import path from 'node:path';

/** Project-relative index path. Same default on every pack node. */
export const DEFAULT_SQLITE_PATH = '.langflower/.cache/hello-embed/kb.sqlite';

export const DEFAULT_SEARCH_TOP_K = 8;

export const MAX_SEARCH_TOP_K = 50;

export const MAX_FILE_BYTES = 512 * 1024;

export const MAX_CHUNKS_PER_FILE = 200;

export const SKIP_DIR_NAMES = new Set(['node_modules', '.git']);

export const CACHE_PREFIX = '.langflower/.cache';

const toPosix = (value: string): string => value.replaceAll('\\', '/');

export const asPosixRelative = (value: string): string => toPosix(value);

/**
 * Resolve `relativeOrEmpty` under `projectDir`. Empty means `projectDir`.
 * Rejects paths that escape the project root.
 */
export const resolveUnderProject = (
	projectDir: string,
	relativeOrEmpty: string,
): string => {
	const root = path.resolve(projectDir);
	const trimmed = relativeOrEmpty.trim();
	const resolved =
		trimmed.length === 0
			? root
			: path.isAbsolute(trimmed)
				? path.resolve(trimmed)
				: path.resolve(root, trimmed);
	const rel = path.relative(root, resolved);
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		throw new Error(`Path escapes projectDir: ${trimmed}`);
	}
	return resolved;
};

export const resolveSqlitePath = (
	projectDir: string,
	override?: string,
): string => {
	const raw =
		typeof override === 'string' && override.trim().length > 0
			? override.trim()
			: DEFAULT_SQLITE_PATH;
	return resolveUnderProject(projectDir, raw);
};

export const clampTopK = (value: unknown, fallback: number): number => {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim().length > 0
				? Number(value)
				: fallback;
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.min(MAX_SEARCH_TOP_K, Math.max(1, Math.floor(parsed)));
};

export const isCacheRelative = (relPosix: string): boolean =>
	relPosix === CACHE_PREFIX || relPosix.startsWith(`${CACHE_PREFIX}/`);
