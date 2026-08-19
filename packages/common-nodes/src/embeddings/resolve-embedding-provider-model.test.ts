import { describe, expect, it } from 'vitest';
import { resolveEmbeddingProviderModel } from './resolve-embedding-provider-model.js';

describe('resolveEmbeddingProviderModel', () => {
	it('prefers non-empty node params', () => {
		expect(
			resolveEmbeddingProviderModel(
				{ providerId: 'openai', model: 'text-embedding-3-small' },
				{
					defaultEmbedding: {
						providerId: 'lmstudio',
						model: 'local-embed',
					},
				},
			),
		).toEqual({
			providerId: 'openai',
			model: 'text-embedding-3-small',
		});
	});

	it('falls back to host defaultEmbedding when params are empty', () => {
		expect(
			resolveEmbeddingProviderModel(
				{ providerId: '', model: '' },
				{
					defaultEmbedding: {
						providerId: 'lmstudio',
						model: 'nomic-embed',
					},
				},
			),
		).toEqual({
			providerId: 'lmstudio',
			model: 'nomic-embed',
		});
	});

	it('fills only the empty field from default', () => {
		expect(
			resolveEmbeddingProviderModel(
				{ providerId: 'openai', model: '' },
				{
					defaultEmbedding: {
						providerId: 'lmstudio',
						model: 'text-embedding-3-small',
					},
				},
			),
		).toEqual({
			providerId: 'openai',
			model: 'text-embedding-3-small',
		});
	});

	it('returns empty strings when neither params nor default exist', () => {
		expect(resolveEmbeddingProviderModel({}, undefined)).toEqual({
			providerId: '',
			model: '',
		});
	});
});
