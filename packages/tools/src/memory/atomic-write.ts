import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Atomically replace `filePath` contents via temp sibling + rename.
 */
export const atomicWriteFile = async (
	filePath: string,
	content: string,
): Promise<void> => {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	const tempPath = path.join(
		dir,
		`.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
	);

	try {
		await fs.writeFile(tempPath, content, 'utf8');
		await fs.rename(tempPath, filePath);
	} catch (error) {
		await fs.unlink(tempPath).catch(() => undefined);
		throw error;
	}
};
