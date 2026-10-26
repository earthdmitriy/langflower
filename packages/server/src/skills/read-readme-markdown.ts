import fs from 'node:fs/promises';
import path from 'node:path';

/** Full UTF-8 body of project-root `README.md`, or `''` when missing. */
export const readReadmeMarkdown = async (
	projectDir: string,
): Promise<string> => {
	try {
		return await fs.readFile(path.join(projectDir, 'README.md'), 'utf8');
	} catch {
		return '';
	}
};
