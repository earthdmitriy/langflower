import path from 'node:path';
import { resolveProjectPath } from '../path-sandbox.js';

export const MEMORY_ROOT_RELATIVE = '.langflower/memory';

export const memoryRootAbsolute = (projectDir: string): string =>
	path.join(path.resolve(projectDir), MEMORY_ROOT_RELATIVE);

/**
 * Resolve a path relative to the memory folder into an absolute path under
 * `.langflower/memory/`. Rejects escape via `..` / absolute paths outside root.
 */
export const resolveMemoryFilePath = (
	projectDir: string,
	filePath: string,
): string => {
	const trimmed = filePath.trim().replace(/\\/g, '/');

	if (trimmed.length === 0) {
		throw new Error('file_path is required.');
	}

	if (path.isAbsolute(trimmed) || trimmed.startsWith('/')) {
		throw new Error(
			`Memory file_path must be relative to the memory folder, got «${filePath}».`,
		);
	}

	const underMemory = path.posix.join(MEMORY_ROOT_RELATIVE, trimmed);
	return resolveProjectPath(projectDir, underMemory);
};

/** Display path relative to the memory folder (posix). */
export const toMemoryRelativePath = (
	projectDir: string,
	absolute: string,
): string => {
	const root = memoryRootAbsolute(projectDir);
	const relative = path.relative(root, absolute).split(path.sep).join('/');

	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`Path «${absolute}» is outside the memory folder.`);
	}

	return relative;
};
