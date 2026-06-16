import fs from 'node:fs/promises';
import path from 'node:path';

const pathExists = async (targetPath: string): Promise<boolean> => {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
};

/** Copy a single file when the destination path does not exist. */
export const copyFileIfMissing = async (
	sourcePath: string,
	destinationPath: string,
): Promise<void> => {
	if (await pathExists(destinationPath)) {
		return;
	}

	await fs.mkdir(path.dirname(destinationPath), { recursive: true });
	await fs.copyFile(sourcePath, destinationPath);
};

/**
 * Recursively copy a directory when the destination directory does not exist.
 * Existence of the destination path (even empty) skips the copy — no overwrite.
 */
export const copyDirIfMissing = async (
	sourceDir: string,
	destinationDir: string,
): Promise<void> => {
	if (await pathExists(destinationDir)) {
		return;
	}

	await fs.cp(sourceDir, destinationDir, {
		recursive: true,
		errorOnExist: true,
	});
};
