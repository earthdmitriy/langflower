import { describe, expect, it } from 'vitest';
import { mergeLangflowerConfigLayers } from './merge-langflower-config-layers.js';

describe('mergeLangflowerConfigLayers', () => {
	it('lets project model and provider ids win over global', () => {
		const merged = mergeLangflowerConfigLayers(
			{
				model: 'global/m',
				provider: {
					a: { name: 'Global A', models: ['g'] },
					b: { name: 'Global B', models: ['gb'] },
				},
			},
			{
				model: 'project/m',
				provider: {
					a: { name: 'Project A', models: ['p'] },
				},
			},
		);

		expect(merged).toEqual({
			model: 'project/m',
			provider: {
				a: { name: 'Project A', models: ['p'] },
				b: { name: 'Global B', models: ['gb'] },
			},
		});
	});

	it('keeps global-only fields when project omits them', () => {
		const merged = mergeLangflowerConfigLayers(
			{
				model: 'global/m',
			},
			{ provider: { x: { name: 'X' } } },
		);

		expect(merged.model).toBe('global/m');
		expect(merged.provider?.x?.name).toBe('X');
	});

	it('lets project serverLogs win over global when set', () => {
		expect(
			mergeLangflowerConfigLayers(
				{ serverLogs: true },
				{ serverLogs: false },
			).serverLogs,
		).toBe(false);
		expect(
			mergeLangflowerConfigLayers({ serverLogs: false }, {}).serverLogs,
		).toBe(false);
	});
});
