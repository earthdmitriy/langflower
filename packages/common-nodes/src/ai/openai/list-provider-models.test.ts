import { describe, expect, it } from 'vitest';
import { listProviderModels } from './list-provider-models.js';

describe('listProviderModels', () => {
	it('maps model ids from the client', async () => {
		const result = await listProviderModels(
			{ apiKey: 'test' },
			{
				createClient: () => ({
					models: {
						list: async () => ({
							data: [{ id: 'gpt-4o-mini' }, { id: 'o1' }],
						}),
					},
				}),
			},
		);

		expect(result.error).toBeUndefined();
		expect(result.models.map((row) => row.id)).toEqual([
			'gpt-4o-mini',
			'o1',
		]);
	});

	it('redacts secret-looking error messages', async () => {
		const result = await listProviderModels(
			{ apiKey: 'sk-secret' },
			{
				createClient: () => ({
					models: {
						list: async () => {
							throw new Error('Invalid apiKey sk-secret');
						},
					},
				}),
			},
		);

		expect(result.models).toEqual([]);
		expect(result.error).toBe('Failed to list models for provider');
	});

	it('surfaces an actionable error when the provider returns an empty list', async () => {
		const result = await listProviderModels(
			{ baseURL: 'http://127.0.0.1:1234' },
			{
				createClient: () => ({
					models: {
						list: async () => ({ data: [] }),
					},
				}),
			},
		);

		expect(result.models).toEqual([]);
		expect(result.error).toMatch(/baseURL usually ends with \/v1/i);
	});
});
