import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the packaged / in-repo skeleton root for bootstrap seed copy.
 *
 * From compiled `dist/bootstrap/*.js`, package root is `../..`.
 * Prefer `dist/skeleton/` when present (future packager layout); otherwise
 * `skeleton/` next to package.json (shipped via package `files`).
 */
export const resolveSkeletonRoot = async (
	fromModuleUrl: string = import.meta.url,
): Promise<string> => {
	const packageRoot = path.resolve(
		path.dirname(fileURLToPath(fromModuleUrl)),
		'../..',
	);
	const distSkeleton = path.join(packageRoot, 'dist', 'skeleton');
	const packageSkeleton = path.join(packageRoot, 'skeleton');

	try {
		const stat = await fs.stat(distSkeleton);

		if (stat.isDirectory()) {
			return distSkeleton;
		}
	} catch {
		// fall through to package skeleton
	}

	try {
		const stat = await fs.stat(packageSkeleton);

		if (stat.isDirectory()) {
			return packageSkeleton;
		}
	} catch {
		// throw below
	}

	throw new Error(
		`Langflower skeleton seed not found (looked for ${distSkeleton} and ${packageSkeleton})`,
	);
};
