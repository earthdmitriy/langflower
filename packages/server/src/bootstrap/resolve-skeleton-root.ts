import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKELETON_RELATIVE = [
	'skeleton',
	path.join('dist', 'skeleton'),
	path.join('vendor', 'server', 'skeleton'),
] as const;

const isDirectory = async (candidate: string): Promise<boolean> => {
	try {
		const stat = await fs.stat(candidate);
		return stat.isDirectory();
	} catch {
		return false;
	}
};

/**
 * Resolve the packaged / in-repo skeleton root for bootstrap seed copy.
 *
 * Walks from the calling module toward filesystem root and accepts:
 * - `skeleton/` next to `@langflower/server` (workspace + vendor package)
 * - `dist/skeleton/` (optional packager layout)
 * - `vendor/server/skeleton/` (published `langflower` product — bundled
 *   `dist/index.js` is not inside the server package tree)
 */
export const resolveSkeletonRoot = async (
	fromModuleUrl: string = import.meta.url,
): Promise<string> => {
	let dir = path.dirname(fileURLToPath(fromModuleUrl));
	const tried: string[] = [];

	for (;;) {
		for (const relative of SKELETON_RELATIVE) {
			const candidate = path.join(dir, relative);
			tried.push(candidate);
			if (await isDirectory(candidate)) {
				return candidate;
			}
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}

		dir = parent;
	}

	throw new Error(
		`Langflower skeleton seed not found (looked for ${tried.join(', ')})`,
	);
};
