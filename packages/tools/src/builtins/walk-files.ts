import fs from 'node:fs/promises';
import path from 'node:path';
import { loadGitIgnoreMatcher } from '../gitignore.js';

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

export const walkFiles = async (
	root: string,
	dir: string,
	respectGitignore: boolean,
): Promise<readonly string[]> => {
	const matcher = respectGitignore
		? await loadGitIgnoreMatcher(root)
		: { ignores: () => false };
	const out: string[] = [];

	const visit = async (absoluteDir: string): Promise<void> => {
		let entries;

		try {
			entries = await fs.readdir(absoluteDir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const absolute = path.join(absoluteDir, entry.name);
			const relative = path
				.relative(root, absolute)
				.split(path.sep)
				.join('/');

			if (matcher.ignores(relative, entry.isDirectory())) {
				continue;
			}

			if (entry.isDirectory()) {
				await visit(absolute);
			} else if (entry.isFile()) {
				out.push(relative);
			}
		}
	};

	await visit(dir);
	return out;
};
