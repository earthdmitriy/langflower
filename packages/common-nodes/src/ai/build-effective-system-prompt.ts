import {
	LLM_ROLE_PRESET_DEFAULTS,
	type LlmRolePreset,
} from './llm-role-preset.js';

export type BuildEffectiveSystemPromptInput = {
	readonly rolePreset: LlmRolePreset;
	readonly systemPromptInput: string;
	readonly agentsMarkdown: string;
	readonly skillMarkdown: string;
};

/** Merges panel/input system text with optional AGENTS.md + skill markdown (no FS). */
export const buildEffectiveSystemPrompt = (
	input: BuildEffectiveSystemPromptInput,
): string => {
	const preset = LLM_ROLE_PRESET_DEFAULTS[input.rolePreset];
	const base =
		input.systemPromptInput.trim() !== ''
			? input.systemPromptInput.trim()
			: preset.systemPrompt.trim();

	const parts: string[] = [];

	if (base !== '') {
		parts.push(base);
	}

	const agents = input.agentsMarkdown.trim();

	if (agents !== '') {
		parts.push(agents);
	}

	const skill = input.skillMarkdown.trim();

	if (skill !== '') {
		parts.push(skill);
	}

	return parts.join('\n\n---\n\n');
};
