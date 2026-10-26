import fs from 'node:fs/promises';
import path from 'node:path';
import { isSafeSkillId } from './is-safe-skill-id.js';
import { skillRoots } from './skill-roots.js';

/**
 * Full UTF-8 body of `SKILL.md` from the first skill root that has it
 * (`.langflower` before `.agents`), or `''` when missing / invalid id.
 */
export const readSkillMarkdown = async (
	projectDir: string,
	skillId: string,
): Promise<string> => {
	if (!isSafeSkillId(skillId)) {
		return '';
	}

	for (const root of skillRoots(projectDir)) {
		try {
			return await fs.readFile(
				path.join(root.absolute, skillId, 'SKILL.md'),
				'utf8',
			);
		} catch {
			// try the next root
		}
	}

	return '';
};
