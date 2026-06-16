import { Injector, runInInjectionContext } from '@angular/core';
import { ReplaySubject, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LangflowerBridgeService } from '../langflower-bridge.service';
import { ModelsCatalogProjectionService } from '../models-catalog-projection.service';

describe('ModelsCatalogProjectionService', () => {
	let modelsCatalogSnapshots$: ReplaySubject<{
		readonly catalogs: Readonly<
			Record<
				string,
				{
					readonly models: readonly { readonly id: string }[];
					readonly error?: string;
				}
			>
		>;
	}>;
	let service: ModelsCatalogProjectionService;

	const bridgeWithCached = () => ({
		cached: {
			'langflower.models.catalog.snapshot':
				modelsCatalogSnapshots$.asObservable(),
		},
	});

	beforeEach(() => {
		modelsCatalogSnapshots$ = new ReplaySubject(1);
		const injector = Injector.create({
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: bridgeWithCached(),
				},
			],
		});
		service = runInInjectionContext(
			injector,
			() => new ModelsCatalogProjectionService(),
		);
	});

	it('maps snapshot payloads to catalog maps', async () => {
		modelsCatalogSnapshots$.next({
			catalogs: {
				local: { models: [{ id: 'gemma' }] },
			},
		});

		await expect(firstValueFrom(service.catalogs$)).resolves.toEqual({
			local: { models: [{ id: 'gemma' }] },
		});
	});

	it('replays a snapshot that arrived before a late subscriber', async () => {
		modelsCatalogSnapshots$.next({
			catalogs: {
				local: { models: [{ id: 'early-model' }] },
			},
		});

		await expect(firstValueFrom(service.catalogs$)).resolves.toEqual({
			local: { models: [{ id: 'early-model' }] },
		});
	});
});
