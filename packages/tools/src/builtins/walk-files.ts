import fs from 'node:fs/promises';
import path from 'node:path';
import { loadGitIgnoreMatcher } from '../gitignore.js';

/** Always skip these directory names (ts-scan-style), even with --no-ignore. */
export const WALK_EXCLUDE_DIR_NAMES = [
	'node_modules',
	'dist',
	'build',
	'.git',
] as const;

export const globToRegExp = (pattern: string): RegExp => {
	const escaped = pattern
		.replace(/\\/g, '/')
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*\*/g, '::DOUBLESTAR::')
		.replace(/\*/g, '[^/]*')
		.replace(/\?/g, '[^/]')
		.replace(/::DOUBLESTAR::/g, '.*');

	return new RegExp(`^${escaped}$`);
};

export type WalkFilesOptions = {
	readonly respectGitignore?: boolean;
	readonly signal?: AbortSignal;
	/** Stop collecting after this many files (default unlimited). */
	readonly maxFiles?: number;
	/** Yield to the event loop every N directory entries (default 32). */
	readonly yieldEvery?: number;
};

const yieldEventLoop = (): Promise<void> =>
	new Promise((resolve) => {
		setImmediate(resolve);
	});

const throwIfAborted = (signal: AbortSignal | undefined): void => {
	if (signal?.aborted) {
		throw new Error('aborted');
	}
};

/**
 * Async recursive file walk.
 */
export const walkFiles = async (
	root: string,
	dir: string,
	options: WalkFilesOptions = {},
): Promise<readonly string[]> => {
	const respectGitignore = options.respectGitignore !== false;
	const yieldEvery = options.yieldEvery ?? 32;
	const matcher = respectGitignore
		? await loadGitIgnoreMatcher(root)
		: { ignores: () => false };
	const out: string[] = [];
	const visitedDirs = new Set<string>();
	let steps = 0;

	const visit = async (absoluteDir: string): Promise<void> => {
		throwIfAborted(options.signal);

		let realDir: string;

		try {
			realDir = await fs.realpath(absoluteDir);
		} catch {
			return;
		}

		if (visitedDirs.has(realDir)) {
			return;
		}

		visitedDirs.add(realDir);

		let entries;

		try {
			entries = await fs.readdir(absoluteDir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			throwIfAborted(options.signal);
			steps += 1;

			if (steps % yieldEvery === 0) {
				await yieldEventLoop();
				throwIfAborted(options.signal);
			}

			if (
				entry.isDirectory() &&
				(WALK_EXCLUDE_DIR_NAMES as readonly string[]).includes(
					entry.name,
				)
			) {
				continue;
			}

			const absolute = path.join(absoluteDir, entry.name);
			const relative = path
				.relative(root, absolute)
				.split(path.sep)
				.join('/');

			if (matcher.ignores(relative, entry.isDirectory())) {
				continue;
			}

			if (entry.isSymbolicLink()) {
				continue;
			}

			if (entry.isDirectory()) {
				await visit(absolute);
			} else if (entry.isFile()) {
				out.push(relative);

				if (
					options.maxFiles !== undefined &&
					out.length >= options.maxFiles
				) {
					return;
				}
			}
		}
	};

	await visit(dir);
	return out;
};
