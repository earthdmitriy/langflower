import { BUILTIN_TOOL_IDS } from '@langflower/tools/create-project-harness';
import { describe, expect, it } from 'vitest';
import {
	HARNESS_BUILTIN_TOOL_IDS,
	LLM_ROLE_PRESET_DEFAULTS,
	migrateEnabledToolIdsToPermissions,
	paramsAfterRolePresetApply,
	parseLlmRolePreset,
	resolveEffectiveSkillId,
	resolveEffectiveToolPermissions,
	toolPermissionsToEnabledIds,
} from './llm-role-preset.js';

describe('llm-role-preset toolPermissions', () => {
	it('materializes toolPermissions on preset apply', () => {
		const afterCoder = paramsAfterRolePresetApply(
			{ model: 'x', enabledToolIds: ['read'] },
			'coder',
		);

		expect(afterCoder.rolePreset).toBe('coder');
		expect(afterCoder.toolPermissions).toEqual(
			LLM_ROLE_PRESET_DEFAULTS.coder.toolPermissions,
		);
		expect(afterCoder).not.toHaveProperty('enabledToolIds');

		const afterPlan = paramsAfterRolePresetApply({}, 'plan');
		expect(afterPlan.toolPermissions).toEqual(
			LLM_ROLE_PRESET_DEFAULTS.plan.toolPermissions,
		);
		expect((afterPlan.toolPermissions as Record<string, string>).bash).toBe(
			'deny',
		);
	});

	it('resolves explicit toolPermissions over legacy allowlist', () => {
		expect(
			resolveEffectiveToolPermissions(
				'custom',
				{ bash: 'ask', read: 'allow' },
				['read'],
			),
		).toEqual({ bash: 'ask', read: 'allow' });
	});

	it('migrates legacy enabledToolIds', () => {
		const migrated = migrateEnabledToolIdsToPermissions([
			'read',
			'bash',
			'crawl_fetch',
		]);
		expect(migrated.read).toBe('allow');
		expect(migrated.bash).toBe('ask');
		expect(migrated.edit).toBe('deny');
		expect(migrated.ask_user).toBe('deny');
		expect(migrated.crawl_fetch).toBe('allow');
	});

	it('toolPermissionsToEnabledIds skips deny and fills missing builtins', () => {
		const ids = toolPermissionsToEnabledIds({
			read: 'allow',
			bash: 'deny',
			write: 'ask',
			crawl_fetch: 'allow',
		});
		expect(ids).toContain('read');
		expect(ids).toContain('write');
		expect(ids).toContain('ask_user');
		expect(ids).toContain('glob');
		expect(ids).toContain('crawl_fetch');
		expect(ids).not.toContain('bash');
	});

	it('HARNESS_BUILTIN_TOOL_IDS matches tools catalog', () => {
		expect([...HARNESS_BUILTIN_TOOL_IDS].sort()).toEqual(
			[...BUILTIN_TOOL_IDS].sort(),
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
