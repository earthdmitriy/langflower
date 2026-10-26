import type { LangflowerSkillConfig } from '@langflower/shared/types/langflower-config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSkillMarkdown } from './parse-skill-markdown.js';
import { skillRoots, type SkillRoot } from './skill-roots.js';

const listRootSkills = async (
	root: SkillRoot,
): Promise<readonly LangflowerSkillConfig[]> => {
	let entries: readonly string[];

	try {
		entries = await fs.readdir(root.absolute);
	} catch {
		return [];
	}

	const skills = await Promise.all(
		entries.map(async (entry): Promise<LangflowerSkillConfig | null> => {
			const skillPath = path.join(root.absolute, entry, 'SKILL.md');

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
				path: `${root.relative}/${entry}/SKILL.md`,
			};
		}),
	);

	return skills.filter(
		(entry): entry is LangflowerSkillConfig => entry !== null,
	);
};

/**
 * Skills from every {@link skillRoots} root, merged by id. An earlier root
 * (`.langflower`) shadows a later one (`.agents`).
 */
export const listSkills = async (
	projectDir: string,
): Promise<readonly LangflowerSkillConfig[]> => {
	const perRoot = await Promise.all(
		skillRoots(projectDir).map(listRootSkills),
	);
	const merged = perRoot
		.flat()
		.reduce(
			(byId, skill) =>
				byId.has(skill.id) ? byId : byId.set(skill.id, skill),
			new Map<string, LangflowerSkillConfig>(),
		);

	return [...merged.values()].sort((left, right) =>
		left.id.localeCompare(right.id),
	);
};
