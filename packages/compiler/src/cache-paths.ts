import path from 'node:path';

export const cacheRoot = (projectDir: string): string =>
	path.join(projectDir, '.langflower', '.cache', 'nodes');

const CACHE_MANIFEST_FILE = 'manifest.json';

export const cacheManifestPath = (projectDir: string): string =>
	path.join(cacheRoot(projectDir), CACHE_MANIFEST_FILE);

export const packCacheDirName = (packageName: string): string =>
	packageName.replace(/[^\w.-]+/g, '_');

export const packCacheDir = (projectDir: string, packageName: string): string =>
	path.join(cacheRoot(projectDir), packCacheDirName(packageName));

const relativeEntry = (packDir: string, entryPath: string): string =>
	path.relative(packDir, entryPath).split(path.sep).join('/');

const cacheEntryStem = (packDir: string, entryPath: string): string =>
	relativeEntry(packDir, entryPath)
		.replace(/[\\/]/g, '__')
		.replace(/\.tsx$/u, '')
		.replace(/\.ts$/u, '');

export const cacheOutfile = (
	projectDir: string,
	packageName: string,
	packDir: string,
	entryPath: string,
): string =>
	path.join(
		packCacheDir(projectDir, packageName),
		`${cacheEntryStem(packDir, entryPath)}.mjs`,
	);

export const relativeEntryPosix = relativeEntry;
