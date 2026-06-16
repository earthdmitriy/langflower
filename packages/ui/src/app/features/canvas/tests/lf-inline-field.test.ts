import { describe, expect, it } from 'vitest';
import {
	selectedSelectDescription,
	withOrphanSelectOptions,
} from '../components/lf-inline-field.component.js';

describe('lf-inline-field select description', () => {
	it('returns the selected option description caption', () => {
		const options = [
			{
				title: 'Plan',
				value: 'plan',
				description: 'Break work into steps',
			},
			{
				title: 'Coder',
				value: 'coder',
				description: 'Implement changes',
			},
		];

		expect(selectedSelectDescription(options, 'coder')).toBe(
			'Implement changes',
		);
		expect(selectedSelectDescription(options, 'missing')).toBeUndefined();
	});
});

describe('withOrphanSelectOptions', () => {
	const catalog = [
		{ title: 'local', value: 'local' },
		{ title: 'cloud', value: 'cloud' },
	];

	it('leaves catalog options unchanged when the value is present', () => {
		expect(withOrphanSelectOptions(catalog, 'local')).toEqual(catalog);
	});

	it('does not inject a blank option for unset empty string', () => {
		expect(withOrphanSelectOptions(catalog, '')).toEqual(catalog);
	});

	it('prepends a missing option when the stored value left the catalog', () => {
		expect(withOrphanSelectOptions(catalog, 'local2')).toEqual([
			{
				value: 'local2',
				title: 'local2 (missing)',
				description:
					'No longer available — choose another option to clear this',
			},
			...catalog,
		]);
	});

	it('prepends missing multiselect values that left the catalog', () => {
		expect(
			withOrphanSelectOptions(catalog, ['local', 'deleted-tool']),
		).toEqual([
			{
				value: 'deleted-tool',
				title: 'deleted-tool (missing)',
				description:
					'No longer available — choose another option to clear this',
			},
			...catalog,
		]);
	});
});

describe('lf-inline-field multiselect description', () => {
	it('exposes optional description on each wired tool option', () => {
		const options = [
			{
				title: 'grep',
				value: 'grep',
				description: 'search files',
			},
			{
				title: 'read_file',
				value: 'read_file',
			},
		];

		expect(options[0]?.description).toBe('search files');
		expect(options[1]?.description).toBeUndefined();
	});
});
