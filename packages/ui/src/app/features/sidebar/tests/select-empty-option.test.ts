import { describe, expect, it } from 'vitest';
import { withSelectEmptyOption } from '../select-empty-option';

describe('withSelectEmptyOption', () => {
	const skills = [
		{ value: 'plan', title: 'Plan', description: 'Break work into steps' },
	];
	const providers = [
		{ value: 'local', title: 'Local' },
		{ value: 'cloud', title: 'Cloud' },
	];

	it('prepends None for langflower.skills selects', () => {
		expect(
			withSelectEmptyOption(
				{ optionsSource: 'langflower.skills' },
				skills,
			),
		).toEqual([{ value: '', title: 'None' }, ...skills]);
	});

	it('prepends Select… for langflower.providers selects', () => {
		expect(
			withSelectEmptyOption(
				{ optionsSource: 'langflower.providers' },
				providers,
			),
		).toEqual([{ value: '', title: 'Select…' }, ...providers]);
	});

	it('prepends Select… for langflower.models selects', () => {
		const models = [{ value: 'm', title: 'm' }];

		expect(
			withSelectEmptyOption(
				{ optionsSource: 'langflower.models' },
				models,
			),
		).toEqual([{ value: '', title: 'Select…' }, ...models]);
	});

	it('uses Default (provider/model) when emptyTitle is set', () => {
		expect(
			withSelectEmptyOption(
				{ optionsSource: 'langflower.providers' },
				providers,
				'Default (lmstudio/local-model)',
			),
		).toEqual([
			{ value: '', title: 'Default (lmstudio/local-model)' },
			...providers,
		]);
	});

	it('is idempotent when an empty option already exists', () => {
		const withNone = [{ value: '', title: 'None' }, ...skills];

		expect(
			withSelectEmptyOption(
				{ optionsSource: 'langflower.skills' },
				withNone,
			),
		).toEqual(withNone);
	});

	it('leaves unrelated option sources unchanged', () => {
		expect(
			withSelectEmptyOption({ optionsSource: 'node.wiredTools' }, [
				{ value: 'grep', title: 'grep' },
			]),
		).toEqual([{ value: 'grep', title: 'grep' }]);
	});
});
