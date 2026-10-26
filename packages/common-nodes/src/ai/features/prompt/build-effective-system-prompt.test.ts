import { describe, expect, it } from 'vitest';
import { buildEffectiveSystemPrompt } from './build-effective-system-prompt.js';
import {
	CODER_AGENT_SYSTEM_PROMPT,
	PLAN_AGENT_SYSTEM_PROMPT,
} from '../llm-role-preset.js';

describe('buildEffectiveSystemPrompt', () => {
	it('uses preset system prompt when the input port is empty', () => {
		expect(
			buildEffectiveSystemPrompt({
				rolePreset: 'plan',
				systemPromptInput: '',
				agentsMarkdown: '',
				skillMarkdown: '',
			}),
		).toBe(PLAN_AGENT_SYSTEM_PROMPT);
	});

	it('prefers wired systemPrompt over preset defaults', () => {
		expect(
			buildEffectiveSystemPrompt({
				rolePreset: 'coder',
				systemPromptInput: 'Override prompt',
				agentsMarkdown: '',
				skillMarkdown: '',
			}),
		).toBe('Override prompt');
	});

	it('appends skill markdown after the base prompt', () => {
		expect(
			buildEffectiveSystemPrompt({
				rolePreset: 'custom',
				systemPromptInput: 'Base',
				agentsMarkdown: '',
				skillMarkdown: '# Skill body',
			}),
		).toBe('Base\n\n---\n\n# Skill body');
	});

	it('appends AGENTS.md between base and skill', () => {
		expect(
			buildEffectiveSystemPrompt({
				rolePreset: 'custom',
				systemPromptInput: 'Base',
				agentsMarkdown: '# Agents',
				skillMarkdown: '# Skill body',
			}),
		).toBe('Base\n\n---\n\n# Agents\n\n---\n\n# Skill body');
	});

	it('returns agents-only text when base and skill are empty', () => {
		expect(
			buildEffectiveSystemPrompt({
				rolePreset: 'custom',
				systemPromptInput: '',
				agentsMarkdown: '# Agents only',
				skillMarkdown: '',
			}),
		).toBe('# Agents only');
	});

	it('returns skill-only text when base prompt is empty', () => {
		expect(
			buildEffectiveSystemPrompt({
				rolePreset: 'custom',
				systemPromptInput: '',
				agentsMarkdown: '',
				skillMarkdown: '# Skill only',
			}),
		).toBe('# Skill only');
	});

	it('returns empty string when all parts are missing', () => {
		expect(
			buildEffectiveSystemPrompt({
				rolePreset: 'custom',
				systemPromptInput: '',
				agentsMarkdown: '',
				skillMarkdown: '',
			}),
		).toBe('');
	});

	it('uses coder preset when rolePreset is coder and input is empty', () => {
		expect(
			buildEffectiveSystemPrompt({
				rolePreset: 'coder',
				systemPromptInput: '   ',
				agentsMarkdown: '',
				skillMarkdown: '',
			}),
		).toBe(CODER_AGENT_SYSTEM_PROMPT);
	});

	describe('sessionContext', () => {
		const base = {
			rolePreset: 'custom',
			systemPromptInput: 'Base',
			agentsMarkdown: '# Agents',
			skillMarkdown: '# Skill body',
		} as const;
		const none = {
			readmeMarkdown: '',
			environment: null,
			harness: false,
			skillCatalog: [],
		} as const;

		it('adds nothing for an empty session context', () => {
			expect(
				buildEffectiveSystemPrompt({ ...base, sessionContext: none }),
			).toBe('Base\n\n---\n\n# Agents\n\n---\n\n# Skill body');
		});

		it('orders agents, readme, environment, harness, skill list, skill', () => {
			const prompt = buildEffectiveSystemPrompt({
				...base,
				sessionContext: {
					readmeMarkdown: '# Readme',
					environment: {
						os: 'win32 10',
						workDir: '/work',
						date: '2026-10-26',
					},
					harness: true,
					skillCatalog: [
						{
							id: 'plan',
							name: 'Plan',
							description: 'Break work down',
							path: '.agents/skills/plan/SKILL.md',
						},
					],
				},
			});
			const positions = [
				'Base',
				'# Agents',
				'# Readme',
				'- OS: win32 10',
				'- Working directory: /work',
				'- Date: 2026-10-26',
				'## Langflower harness',
				'- Plan (plan): Break work down — .agents/skills/plan/SKILL.md',
				'# Skill body',
			].map((needle) => prompt.indexOf(needle));

			expect(positions.every((index) => index >= 0)).toBe(true);
			expect([...positions].sort((a, b) => a - b)).toEqual(positions);
		});

		it('skips the skill list block when the catalog is empty', () => {
			expect(
				buildEffectiveSystemPrompt({
					...base,
					sessionContext: { ...none, harness: true },
				}),
			).not.toContain('Available skills');
		});
	});
});
