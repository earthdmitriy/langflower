import fs from 'node:fs/promises';
import path from 'node:path';

/** Overwrite a single file from source (creates parent dirs). */
export const copyFileForce = async (
	sourcePath: string,
	destinationPath: string,
): Promise<void> => {
	await fs.mkdir(path.dirname(destinationPath), { recursive: true });
	await fs.copyFile(sourcePath, destinationPath);
};

/**
 * Recursively copy a directory, overwriting files that exist in source.
 * Extra files already under destination are left in place.
 */
export const copyDirForce = async (
	sourceDir: string,
	destinationDir: string,
): Promise<void> => {
	await fs.mkdir(destinationDir, { recursive: true });
	await fs.cp(sourceDir, destinationDir, {
		recursive: true,
		force: true,
	});
};
