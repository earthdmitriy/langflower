import type { LangflowerConfig } from '@langflower/shared/langflower.js';
import { listSkills } from './list-skills.js';

/** Merges filesystem skill catalog into config (in-memory only). */
export const withSkillsCatalog = async (
	projectDir: string,
	config: LangflowerConfig,
): Promise<LangflowerConfig> => {
	const skills = await listSkills(projectDir);

	return skills.length > 0 ? { ...config, skills } : config;
};
