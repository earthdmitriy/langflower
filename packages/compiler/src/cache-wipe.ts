import fs from 'node:fs/promises';
import { cacheRoot } from './cache-paths.js';
import type { CompilePackError } from './compile-types.js';
import { formatCompilePackError } from './format-compilation-errors.js';

const isBusyError = (error: unknown): boolean => {
	if (typeof error !== 'object' || error === null || !('code' in error)) {
		return false;
	}

	const code = error.code;
	return code === 'EBUSY' || code === 'EPERM';
};

export const wipeCacheRoot = async (
	projectDir: string,
): Promise<
	| { readonly ok: true }
	| { readonly ok: false; readonly error: CompilePackError }
> => {
	try {
		await fs.rm(cacheRoot(projectDir), { recursive: true, force: true });
		return { ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			ok: false,
			error: formatCompilePackError(
				'.cache/nodes',
				[
					{
						message: `Failed to delete custom-node cache: ${message}`,
					},
				],
				projectDir,
			),
		};
	}
};

export const wipePathOrCacheRoot = async (
	projectDir: string,
	targetPath: string,
): Promise<
	| { readonly ok: true; readonly wipedRoot: boolean }
	| { readonly ok: false; readonly error: CompilePackError }
> => {
	try {
		await fs.rm(targetPath, { recursive: true, force: true });
		return { ok: true, wipedRoot: false };
	} catch (error) {
		if (!isBusyError(error)) {
			const message =
				error instanceof Error ? error.message : String(error);

			return {
				ok: false,
				error: formatCompilePackError(
					'.cache/nodes',
					[
						{
							message: `Failed to delete custom-node cache: ${message}`,
						},
					],
					projectDir,
				),
			};
		}

		const wiped = await wipeCacheRoot(projectDir);
		if (!wiped.ok) {
			return wiped;
		}

		return { ok: true, wipedRoot: true };
	}
};
