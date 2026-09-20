import { BUILTIN_TOOL_IDS } from '@langflower/tools/create-project-harness';
import { describe, expect, it } from 'vitest';
import {
	HARNESS_BUILTIN_TOOL_IDS,
	LLM_ROLE_PRESET_DEFAULTS,
	paramsAfterRolePresetApply,
	parseLlmRolePreset,
	resolveEffectiveSkillId,
	resolveEffectiveToolPermissions,
} from './llm-role-preset.js';

describe('llm-role-preset toolPermissions', () => {
	it('materializes toolPermissions on preset apply', () => {
		const afterCoder = paramsAfterRolePresetApply({ model: 'x' }, 'coder');

		expect(afterCoder.rolePreset).toBe('coder');
		expect(afterCoder.toolPermissions).toEqual(
			LLM_ROLE_PRESET_DEFAULTS.coder.toolPermissions,
		);
		expect(afterCoder.model).toBe('x');

		const afterPlan = paramsAfterRolePresetApply({}, 'plan');
		expect(afterPlan.toolPermissions).toEqual(
			LLM_ROLE_PRESET_DEFAULTS.plan.toolPermissions,
		);
		expect((afterPlan.toolPermissions as Record<string, string>).bash).toBe(
			'deny',
		);
	});

	it('resolves explicit toolPermissions over preset defaults', () => {
		expect(
			resolveEffectiveToolPermissions('custom', {
				bash: 'ask',
				read: 'allow',
			}),
		).toEqual({ bash: 'ask', read: 'allow' });
	});

	it('HARNESS_BUILTIN_TOOL_IDS matches tools catalog', () => {
		expect([...HARNESS_BUILTIN_TOOL_IDS].sort()).toEqual(
			[...BUILTIN_TOOL_IDS].sort(),
		);
	});

	it('role presets treat move like delete', () => {
		expect(LLM_ROLE_PRESET_DEFAULTS.coder.toolPermissions.move).toBe('ask');
		expect(LLM_ROLE_PRESET_DEFAULTS.plan.toolPermissions.move).toBe('deny');
		expect(LLM_ROLE_PRESET_DEFAULTS.explorer.toolPermissions.move).toBe(
			'deny',
		);
		expect(LLM_ROLE_PRESET_DEFAULTS.custom.toolPermissions.move).toBe(
			'allow',
		);
	});

	it('role presets allow sleep by default', () => {
		expect(LLM_ROLE_PRESET_DEFAULTS.custom.toolPermissions.sleep).toBe(
			'allow',
		);
		expect(LLM_ROLE_PRESET_DEFAULTS.plan.toolPermissions.sleep).toBe(
			'allow',
		);
		expect(LLM_ROLE_PRESET_DEFAULTS.coder.toolPermissions.sleep).toBe(
			'allow',
		);
		expect(LLM_ROLE_PRESET_DEFAULTS.explorer.toolPermissions.sleep).toBe(
			'allow',
		);
	});

	it('role presets allow ask_user by default', () => {
		expect(LLM_ROLE_PRESET_DEFAULTS.custom.toolPermissions.ask_user).toBe(
			'allow',
		);
		expect(LLM_ROLE_PRESET_DEFAULTS.plan.toolPermissions.ask_user).toBe(
			'allow',
		);
		expect(LLM_ROLE_PRESET_DEFAULTS.coder.toolPermissions.ask_user).toBe(
			'allow',
		);
		expect(LLM_ROLE_PRESET_DEFAULTS.explorer.toolPermissions.ask_user).toBe(
			'allow',
		);
	});

	it('parseLlmRolePreset falls back to custom', () => {
		expect(parseLlmRolePreset('coder')).toBe('coder');
		expect(parseLlmRolePreset('nope')).toBe('custom');
	});

	it('Plan preset defaults to spec-architect skill when skillId is empty', () => {
		expect(LLM_ROLE_PRESET_DEFAULTS.plan.skillId).toBe('spec-architect');
		expect(resolveEffectiveSkillId('plan', '')).toBe('spec-architect');
		expect(resolveEffectiveSkillId('plan', '  ')).toBe('spec-architect');
		expect(resolveEffectiveSkillId('plan', 'custom-plan')).toBe(
			'custom-plan',
		);
	});
});
