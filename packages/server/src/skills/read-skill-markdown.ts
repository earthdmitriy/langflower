import fs from 'node:fs/promises';
import path from 'node:path';
import { isSafeSkillId } from './is-safe-skill-id.js';

const skillFilePath = (projectDir: string, skillId: string): string =>
	path.join(projectDir, '.langflower', 'skills', skillId, 'SKILL.md');

/** Full UTF-8 body of `SKILL.md`, or `''` when missing / invalid id. */
export const readSkillMarkdown = async (
	projectDir: string,
	skillId: string,
): Promise<string> => {
	if (!isSafeSkillId(skillId)) {
		return '';
	}

	const filePath = skillFilePath(projectDir, skillId);

	try {
		return await fs.readFile(filePath, 'utf8');
	} catch {
		return '';
	}
};
