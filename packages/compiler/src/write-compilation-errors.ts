import fs from 'node:fs/promises';
import path from 'node:path';
import type { CompilePackError } from './compile-types.js';
import { renderCompilationErrorsMarkdown } from './format-compilation-errors.js';

export const COMPILATION_ERRORS_FILE = 'COMPILATION_ERRORS.md';

export const writeCompilationErrorsFile = async (
	packDir: string,
	packageName: string,
	errors: readonly CompilePackError[],
): Promise<void> => {
	if (errors.length === 0) {
		await deleteCompilationErrorsFile(packDir);
		return;
	}

	const filePath = path.join(packDir, COMPILATION_ERRORS_FILE);
	await fs.writeFile(
		filePath,
		renderCompilationErrorsMarkdown(packageName, errors),
		'utf8',
	);
};

export const deleteCompilationErrorsFile = async (
	packDir: string,
): Promise<void> => {
	const filePath = path.join(packDir, COMPILATION_ERRORS_FILE);

	try {
		await fs.unlink(filePath);
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return;
		}

		throw error;
	}
};
