import { describe, expect, it } from 'vitest';
import { mergeProviderModelOptions } from './merge-provider-model-options.js';

describe('mergeProviderModelOptions', () => {
	it('merges static and fetched models without duplicate ids', () => {
		expect(
			mergeProviderModelOptions(
				['local-model', 'gpt-4o-mini'],
				[
					{ id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
					{ id: 'gpt-4o', name: 'GPT-4o' },
				],
			),
		).toEqual([
			{ value: 'local-model', title: 'local-model' },
			{ value: 'gpt-4o-mini', title: 'GPT-4o Mini' },
			{ value: 'gpt-4o', title: 'GPT-4o' },
		]);
	});

	it('returns static models when fetch is empty', () => {
		expect(mergeProviderModelOptions(['local-model'], [])).toEqual([
			{ value: 'local-model', title: 'local-model' },
		]);
	});

	it('returns fetched-only ids when static list is missing', () => {
		expect(
			mergeProviderModelOptions(undefined, [{ id: 'remote-model' }]),
		).toEqual([{ value: 'remote-model', title: 'remote-model' }]);
	});
});
