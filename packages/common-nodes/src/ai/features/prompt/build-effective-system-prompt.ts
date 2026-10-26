import type { PromptSessionContext } from '@langflower/node-sdk';
import {
	LLM_ROLE_PRESET_DEFAULTS,
	type LlmRolePreset,
} from '../llm-role-preset.js';
import { HARNESS_CONTEXT_TEXT } from './harness-context-text.js';

export type BuildEffectiveSystemPromptInput = {
	readonly rolePreset: LlmRolePreset;
	readonly systemPromptInput: string;
	readonly agentsMarkdown: string;
	readonly skillMarkdown: string;
	readonly sessionContext?: PromptSessionContext;
};

const environmentBlock = (
	environment: NonNullable<PromptSessionContext['environment']>,
): string =>
	[
		'## Environment',
		`- OS: ${environment.os}`,
		`- Working directory: ${environment.workDir}`,
		`- Date: ${environment.date}`,
	].join('\n');

const skillCatalogBlock = (
	catalog: PromptSessionContext['skillCatalog'],
): string =>
	catalog.length === 0
		? ''
		: [
				'## Available skills',
				'Read a skill file when its description matches the task.',
				...catalog.map(
					(skill) =>
						`- ${skill.name} (${skill.id}): ${skill.description} — ${skill.path}`,
				),
			].join('\n');

/**
 * Merges panel/input system text with optional AGENTS.md, README, environment,
 * harness, skill-list and selected-skill blocks (no FS), in that order.
 */
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

	const context = input.sessionContext;
	const readme = context?.readmeMarkdown.trim() ?? '';

	if (readme !== '') {
		parts.push(readme);
	}

	if (context?.environment != null) {
		parts.push(environmentBlock(context.environment));
	}

	if (context?.harness === true) {
		parts.push(HARNESS_CONTEXT_TEXT);
	}

	const catalog = skillCatalogBlock(context?.skillCatalog ?? []);

	if (catalog !== '') {
		parts.push(catalog);
	}

	const skill = input.skillMarkdown.trim();

	if (skill !== '') {
		parts.push(skill);
	}

	return parts.join('\n\n---\n\n');
};
