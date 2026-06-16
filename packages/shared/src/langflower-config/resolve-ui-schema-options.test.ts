import { describe, expect, it } from 'vitest';
import { resolveUiSchemaOptions } from './resolve-ui-schema-options.js';

describe('resolveUiSchemaOptions', () => {
	it('returns static options when uiSchema item defines options', () => {
		const options = resolveUiSchemaOptions(
			{},
			{
				options: [
					{ value: 'plan', title: 'Plan' },
					{ value: 'coder', title: 'Coder' },
				],
			},
			{},
		);

		expect(options).toEqual([
			{ value: 'plan', title: 'Plan' },
			{ value: 'coder', title: 'Coder' },
		]);
	});

	it('returns skill options with title and description', () => {
		const options = resolveUiSchemaOptions(
			{
				skills: [
					{
						id: 'plan',
						name: 'Plan',
						description: 'Break work into steps',
					},
				],
			},
			{ optionsSource: 'langflower.skills' },
			{},
		);

		expect(options).toEqual([
			{
				value: 'plan',
				title: 'Plan',
				description: 'Break work into steps',
			},
		]);
	});

	it('throws for node.wiredTools (graph-owned resolver)', () => {
		expect(() =>
			resolveUiSchemaOptions(
				{},
				{ optionsSource: 'node.wiredTools' },
				{},
			),
		).toThrow(/resolveEnabledToolOptions/);
	});
});
