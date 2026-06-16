import path from 'node:path';
import type { CompileDiagnostic, CompilePackError } from './compile-types.js';

/**
 * Absolute or pack-relative file → path relative to `projectDir` (posix `/`).
 * Leaves non-project paths unchanged (still normalized to `/`).
 */
export const toProjectRelativePath = (
	filePath: string,
	projectDir: string,
): string => {
	const absolute = path.isAbsolute(filePath)
		? filePath
		: path.resolve(projectDir, filePath);
	const relative = path.relative(projectDir, absolute);

	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		return filePath.split(path.sep).join('/');
	}

	return relative.split(path.sep).join('/');
};

export const relativizeDiagnostic = (
	diagnostic: CompileDiagnostic,
	projectDir: string,
): CompileDiagnostic => {
	if (diagnostic.file === undefined) {
		return diagnostic;
	}

	return {
		...diagnostic,
		file: toProjectRelativePath(diagnostic.file, projectDir),
	};
};

export const relativizeDiagnostics = (
	diagnostics: readonly CompileDiagnostic[],
	projectDir: string,
): readonly CompileDiagnostic[] =>
	diagnostics.map((diagnostic) =>
		relativizeDiagnostic(diagnostic, projectDir),
	);

/** One markdown / UI line: `- rel/path:line:col: message` */
export const formatDiagnosticLine = (diagnostic: CompileDiagnostic): string => {
	const location =
		diagnostic.file === undefined
			? ''
			: diagnostic.line === undefined
				? `${diagnostic.file}: `
				: diagnostic.column === undefined
					? `${diagnostic.file}:${diagnostic.line}: `
					: `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}: `;

	return `- ${location}${diagnostic.message}`;
};

/**
 * Body shared by `CompilePackError.message` and `COMPILATION_ERRORS.md`
 * (diagnostic lines only — no generic “Typecheck failed…” wrapper).
 */
export const formatPackErrorMessage = (
	diagnostics: readonly CompileDiagnostic[],
	projectDir: string,
): string => {
	const relative = relativizeDiagnostics(diagnostics, projectDir);

	if (relative.length === 0) {
		return 'Compilation failed (no diagnostics).';
	}

	return relative.map(formatDiagnosticLine).join('\n');
};

export const formatCompilePackError = (
	packageName: string,
	diagnostics: readonly CompileDiagnostic[],
	projectDir: string,
): CompilePackError => {
	const relativeDiagnostics = relativizeDiagnostics(diagnostics, projectDir);

	return {
		packageName,
		message: formatPackErrorMessage(diagnostics, projectDir),
		diagnostics: relativeDiagnostics,
	};
};

export const renderCompilationErrorsMarkdown = (
	packageName: string,
	errors: readonly CompilePackError[],
): string => {
	const lines = [`# Compilation errors — \`${packageName}\``, ''];

	for (const error of errors) {
		lines.push(error.message, '');
	}

	return `${lines.join('\n')}`;
};
