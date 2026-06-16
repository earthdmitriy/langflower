import type { LangflowerSkillConfig } from '@langflower/shared/langflower.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSkillMarkdown } from './parse-skill-markdown.js';

const skillsRoot = (projectDir: string): string =>
	path.join(projectDir, '.langflower', 'skills');

export const listSkills = async (
	projectDir: string,
): Promise<readonly LangflowerSkillConfig[]> => {
	const root = skillsRoot(projectDir);

	let entries: readonly string[];

	try {
		entries = await fs.readdir(root);
	} catch {
		return [];
	}

	const skills = await Promise.all(
		entries.map(async (entry): Promise<LangflowerSkillConfig | null> => {
			const skillPath = path.join(root, entry, 'SKILL.md');

			try {
				const stat = await fs.stat(skillPath);

				if (!stat.isFile()) {
					return null;
				}
			} catch {
				return null;
			}

			const content = await fs.readFile(skillPath, 'utf8');
			const parsed = parseSkillMarkdown(content);

			return {
				id: entry,
				name: parsed.name ?? entry,
				description: parsed.description ?? '',
			};
		}),
	);

	return skills
		.filter((entry): entry is LangflowerSkillConfig => entry !== null)
		.sort((left, right) => left.id.localeCompare(right.id));
};
