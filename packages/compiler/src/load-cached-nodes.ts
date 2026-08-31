import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cacheOutfile } from './cache-paths.js';
import type { CompilePackError, DiscoveredPack } from './compile-types.js';
import { formatCompilePackError } from './format-compilation-errors.js';
import { parseDefaultExport } from './validate-default-export.js';

export const loadBundledDefault = async (
	outfile: string,
	entryPath: string,
	packageName: string,
	projectDir: string,
): Promise<
	| { readonly ok: true; readonly nodes: readonly ReactiveNodeDefinition[] }
	| { readonly ok: false; readonly error: CompilePackError }
> => {
	const loadFile = path.join(
		os.tmpdir(),
		`lf-node-load-${process.hrtime.bigint()}.mjs`,
	);

	try {
		// Stable outfile stays at `<pack>/<entry>.mjs` for git diff. Import a
		// unique temp copy so Node / Vitest ESM cache cannot reuse the previous
		// module for that path (query strings are not enough under Vitest).
		await fs.copyFile(outfile, loadFile);
		const href = `${pathToFileURL(loadFile).href}?t=${Date.now()}`;
		const mod: unknown = await import(href);
		const defaultExport =
			typeof mod === 'object' && mod !== null && 'default' in mod
				? mod.default
				: undefined;
		const parsed = parseDefaultExport(defaultExport, entryPath);

		if (!parsed.ok) {
			return {
				ok: false,
				error: formatCompilePackError(
					packageName,
					[parsed.diagnostic],
					projectDir,
				),
			};
		}

		return { ok: true, nodes: parsed.nodes };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			ok: false,
			error: formatCompilePackError(
				packageName,
				[
					{
						file: entryPath,
						message: `Failed to load bundled module: ${message}`,
					},
				],
				projectDir,
			),
		};
	}
};

export const loadPackFromCache = async (
	projectDir: string,
	pack: DiscoveredPack,
): Promise<
	| { readonly ok: true; readonly nodes: readonly ReactiveNodeDefinition[] }
	| { readonly ok: false; readonly error: CompilePackError }
> => {
	const nodes: ReactiveNodeDefinition[] = [];

	for (const entryPath of pack.entries) {
		const outfile = cacheOutfile(
			projectDir,
			pack.packageName,
			pack.packDir,
			entryPath,
		);
		const loaded = await loadBundledDefault(
			outfile,
			entryPath,
			pack.packageName,
			projectDir,
		);

		if (!loaded.ok) {
			return loaded;
		}

		nodes.push(...loaded.nodes);
	}

	return { ok: true, nodes };
};
