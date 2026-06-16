import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { CompileDiagnostic } from './compile-types.js';
import {
	hostPathMappings,
	resolveHostTypeRoots,
} from './resolve-host-types.js';

const normalizePath = (filePath: string): string =>
	path.normalize(filePath).toLowerCase();

const toCompileDiagnostic = (diagnostic: ts.Diagnostic): CompileDiagnostic => {
	const message = ts.flattenDiagnosticMessageText(
		diagnostic.messageText,
		'\n',
	);

	if (diagnostic.file === undefined || diagnostic.start === undefined) {
		return { message };
	}

	const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
		diagnostic.start,
	);

	return {
		file: diagnostic.file.fileName,
		line: line + 1,
		column: character + 1,
		message,
	};
};

export type PackTypecheckResult = {
	/** Diagnostics whose file is this entry path (normalized). */
	readonly byEntry: ReadonlyMap<string, readonly CompileDiagnostic[]>;
	/**
	 * Diagnostics in non-entry files (shared modules or config) —
	 * fail every entry in the pack.
	 */
	readonly shared: readonly CompileDiagnostic[];
};

const emptyTypecheck = (): PackTypecheckResult => ({
	byEntry: new Map(),
	shared: [],
});

/**
 * Run `tsc --noEmit` for a pack when `tsconfig.json` exists.
 * Returns diagnostics grouped for per-entry gates.
 *
 * Host peers (`@langflower/node-sdk`, `rxjs`, `@rx-evo/stateful-observable`)
 * and `@types/node` resolve from the Langflower/compiler install tree so
 * peer-only packs typecheck without project or pack `node_modules`.
 */
export const typecheckPack = (
	packDir: string,
	entries: readonly string[],
): PackTypecheckResult => {
	const configPath = path.join(packDir, 'tsconfig.json');
	if (!fs.existsSync(configPath)) {
		return emptyTypecheck();
	}

	const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
	if (readResult.error !== undefined) {
		return {
			byEntry: new Map(),
			shared: [toCompileDiagnostic(readResult.error)],
		};
	}

	const parsed = ts.parseJsonConfigFileContent(
		readResult.config,
		ts.sys,
		packDir,
		undefined,
		configPath,
	);

	if (parsed.errors.length > 0) {
		return {
			byEntry: new Map(),
			shared: parsed.errors.map(toCompileDiagnostic),
		};
	}

	const hostTypeRoots = resolveHostTypeRoots();

	const options: ts.CompilerOptions = {
		...parsed.options,
		noEmit: true,
		ignoreDeprecations: '6.0',
		baseUrl: parsed.options.baseUrl ?? packDir,
		typeRoots: [...(parsed.options.typeRoots ?? []), ...hostTypeRoots],
		paths: {
			...parsed.options.paths,
			...hostPathMappings(),
		},
	};

	const program = ts.createProgram({
		rootNames: parsed.fileNames,
		options,
	});

	const diagnostics = ts
		.getPreEmitDiagnostics(program)
		.filter(
			(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
		);

	const entrySet = new Set(entries.map(normalizePath));
	const byEntry = new Map<string, CompileDiagnostic[]>();
	const shared: CompileDiagnostic[] = [];

	for (const entry of entries) {
		byEntry.set(normalizePath(entry), []);
	}

	const packPrefix = normalizePath(packDir) + path.sep;

	for (const diagnostic of diagnostics) {
		const mapped = toCompileDiagnostic(diagnostic);
		const file = mapped.file;

		if (file === undefined) {
			shared.push(mapped);
			continue;
		}

		const normalized = normalizePath(file);
		if (entrySet.has(normalized)) {
			byEntry.get(normalized)?.push(mapped);
			continue;
		}

		if (
			normalized.startsWith(packPrefix) &&
			(file.endsWith('.ts') || file.endsWith('.tsx'))
		) {
			shared.push(mapped);
		}
		// Ignore diagnostics outside the pack (resolved host deps).
	}

	return { byEntry, shared };
};

export const diagnosticsForEntry = (
	typecheck: PackTypecheckResult,
	entryPath: string,
): readonly CompileDiagnostic[] => {
	const entryDiagnostics =
		typecheck.byEntry.get(normalizePath(entryPath)) ?? [];

	if (typecheck.shared.length > 0) {
		return [...typecheck.shared, ...entryDiagnostics];
	}

	return entryDiagnostics;
};
