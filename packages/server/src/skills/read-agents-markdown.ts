import fs from 'node:fs/promises';
import path from 'node:path';

const agentsFilePath = (projectDir: string): string =>
	path.join(projectDir, 'AGENTS.md');

/** Full UTF-8 body of project-root `AGENTS.md`, or `''` when missing. */
export const readAgentsMarkdown = async (
	projectDir: string,
): Promise<string> => {
	const filePath = agentsFilePath(projectDir);

	try {
		return await fs.readFile(filePath, 'utf8');
	} catch {
		return '';
	}
};
