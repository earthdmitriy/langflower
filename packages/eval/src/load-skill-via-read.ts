import type { Harness } from '@langflower/tools/create-project-harness';

/**
 * Load a skill / instruction markdown file through the builtin `read` tool
 * (not panel `skillId`). Fail-closed when the harness returns an error.
 */
export const loadSkillViaRead = async (
	harness: Harness,
	skillPath: string,
): Promise<string> => {
	const result = await harness.invoke({
		toolId: 'read',
		args: { path: skillPath },
	});
	if (!result.ok) {
		throw new Error(
			`failed to read skill via harness read (${skillPath}): ${result.text}`,
		);
	}
	return result.text;
};
