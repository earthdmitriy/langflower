import path from 'node:path';

/** Project-relative skill roots in precedence order (first root wins on id clash). */
const SKILL_ROOT_SEGMENTS = [
	['.langflower', 'skills'],
	['.agents', 'skills'],
] as const;

export type SkillRoot = {
	readonly absolute: string;
	/** Forward-slash project-relative path, e.g. `.agents/skills`. */
	readonly relative: string;
};

export const skillRoots = (projectDir: string): readonly SkillRoot[] =>
	SKILL_ROOT_SEGMENTS.map((segments) => ({
		absolute: path.join(projectDir, ...segments),
		relative: segments.join('/'),
	}));
