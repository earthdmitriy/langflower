import { describe, expect, it } from 'vitest';
import {
	LLM_ROLE_PRESET_DEFAULTS,
	migrateEnabledToolIdsToPermissions,
	paramsAfterRolePresetApply,
	parseLlmRolePreset,
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
		expect(migrated.crawl_fetch).toBe('allow');
	});

	it('toolPermissionsToEnabledIds skips deny', () => {
		expect(
			toolPermissionsToEnabledIds({
				read: 'allow',
				bash: 'deny',
				write: 'ask',
			}),
		).toEqual(['read', 'write']);
	});

	it('parseLlmRolePreset falls back to custom', () => {
		expect(parseLlmRolePreset('coder')).toBe('coder');
		expect(parseLlmRolePreset('nope')).toBe('custom');
	});
});
