import { beforeEach, describe, expect, it, vi } from 'vitest';

const listProviderModels = vi.fn();

vi.mock('./bind-llm-context.js', () => ({
	listProviderModels: (...args: unknown[]) => listProviderModels(...args),
}));

describe('buildModelsCatalogSnapshot', () => {
	beforeEach(() => {
		listProviderModels.mockReset();
	});

	it('lists every configured provider into the catalogs map', async () => {
		const { buildModelsCatalogSnapshot } =
			await import('./push-models-catalog.js');

		listProviderModels.mockImplementation(
			async (_service: unknown, providerId: string) => {
				if (providerId === 'broken') {
					return {
						models: [],
						error: 'Provider returned no models',
					};
				}

				return { models: [{ id: `${providerId}-m1` }] };
			},
		);

		const snapshot = await buildModelsCatalogSnapshot({
			langflowerConfigService: {
				read: async () => ({
					provider: {
						local: { name: 'local' },
						broken: { name: 'broken' },
					},
				}),
			},
		} as never);

		expect(snapshot).toEqual({
			catalogs: {
				local: { models: [{ id: 'local-m1' }] },
				broken: {
					models: [],
					error: 'Provider returned no models',
				},
			},
		});
		expect(listProviderModels).toHaveBeenCalledTimes(2);
	});

	it('returns an empty catalogs map when no providers are configured', async () => {
		const { buildModelsCatalogSnapshot } =
			await import('./push-models-catalog.js');

		const snapshot = await buildModelsCatalogSnapshot({
			langflowerConfigService: {
				read: async () => ({}),
			},
		} as never);

		expect(snapshot).toEqual({ catalogs: {} });
		expect(listProviderModels).not.toHaveBeenCalled();
	});
});
