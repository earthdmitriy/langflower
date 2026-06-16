import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CompileDiagnostic } from './compile-types.js';
import {
	isHostPeerSpecifier,
	resolveHostPackageEntry,
} from './resolve-host-types.js';

const mapEsbuildErrors = (
	errors: readonly esbuild.Message[],
	packDir: string,
): readonly CompileDiagnostic[] =>
	errors.map((error) => {
		const location = error.location;
		const file =
			location === null
				? undefined
				: path.isAbsolute(location.file)
					? location.file
					: path.join(packDir, location.file);

		return {
			...(file !== undefined ? { file } : {}),
			...(location !== null
				? { line: location.line, column: location.column }
				: {}),
			message: error.text,
		};
	});

export type BundleEntryResult =
	| { readonly ok: true; readonly outfile: string }
	| {
			readonly ok: false;
			readonly diagnostics: readonly CompileDiagnostic[];
	  };

/**
 * Bundle one entry to ESM under the project cache. Author deps are bundled;
 * host SDK / rxjs / node builtins stay external (host peers rewritten to
 * absolute `file://` URLs from the Langflower install tree).
 */
export const bundleEntry = async (options: {
	readonly entryPath: string;
	readonly packDir: string;
	readonly outfile: string;
}): Promise<BundleEntryResult> => {
	await fs.mkdir(path.dirname(options.outfile), { recursive: true });

	try {
		await esbuild.build({
			entryPoints: [options.entryPath],
			outfile: options.outfile,
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node22',
			absWorkingDir: options.packDir,
			logLevel: 'silent',
			packages: 'bundle',
			plugins: [
				{
					name: 'langflower-externals',
					setup(build) {
						build.onResolve({ filter: /.*/ }, (args) => {
							if (args.kind === 'entry-point') {
								return undefined;
							}

							if (args.path.startsWith('node:')) {
								return {
									path: args.path,
									external: true,
								};
							}

							if (!isHostPeerSpecifier(args.path)) {
								return undefined;
							}

							const resolved = resolveHostPackageEntry(args.path);
							if (resolved === undefined) {
								return {
									errors: [
										{
											text: `Cannot resolve host peer '${args.path}' from the Langflower install. Peer-only packs need no npm install; this usually means a broken Langflower install.`,
										},
									],
								};
							}

							return {
								path: pathToFileURL(resolved).href,
								external: true,
							};
						});
					},
				},
			],
		});

		return { ok: true, outfile: options.outfile };
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'errors' in error &&
			Array.isArray(error.errors)
		) {
			return {
				ok: false,
				diagnostics: mapEsbuildErrors(
					error.errors as readonly esbuild.Message[],
					options.packDir,
				),
			};
		}

		const message = error instanceof Error ? error.message : String(error);

		return {
			ok: false,
			diagnostics: [
				{
					file: options.entryPath,
					message,
				},
			],
		};
	}
};
