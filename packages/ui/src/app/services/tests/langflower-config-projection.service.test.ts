import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { Subject, firstValueFrom, skip } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LangflowerBridgeService } from '../langflower-bridge.service';
import { LangflowerConfigProjectionService } from '../langflower-config-projection.service';

const createRaw = () => ({
	'session.state.snapshot': new Subject<{
		readonly langflowerConfig: {
			readonly provider?: Readonly<
				Record<string, { readonly name: string }>
			>;
		};
	}>(),
	'langflower.config.snapshot': new Subject<{
		readonly config: {
			readonly provider?: Readonly<
				Record<string, { readonly name: string }>
			>;
		};
		readonly projectConfig: {
			readonly provider?: Readonly<
				Record<string, { readonly name: string }>
			>;
		};
		readonly globalConfig: {
			readonly provider?: Readonly<
				Record<string, { readonly name: string }>
			>;
		};
		readonly globalPath: string;
		readonly secretIds: readonly string[];
		readonly secretsPath: string;
	}>(),
});

describe('LangflowerConfigProjectionService', () => {
	let cached: ReturnType<typeof createRaw>;
	let service: LangflowerConfigProjectionService;

	beforeEach(() => {
		cached = createRaw();
		const injector = Injector.create({
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: { raw: cached, cached },
				},
				{ provide: DestroyRef, useValue: { onDestroy: () => {} } },
			],
		});
		service = runInInjectionContext(
			injector,
			() => new LangflowerConfigProjectionService(),
		);
	});

	it('starts with an empty config', () => {
		expect(service.config()).toEqual({});
		expect(service.layers().globalPath).toBe('');
		expect(service.layers().secretIds).toEqual([]);
		expect(service.layers().secretsPath).toBe('');
	});

	it('keeps the latest config for a late subscriber after config.snapshot', async () => {
		cached['langflower.config.snapshot'].next({
			config: {
				provider: {
					lmstudio: { name: 'LM Studio' },
					openai: { name: 'OpenAI' },
				},
			},
			projectConfig: {
				provider: { openai: { name: 'OpenAI' } },
			},
			globalConfig: {
				provider: { lmstudio: { name: 'LM Studio' } },
			},
			globalPath: '/tmp/global-langflower.jsonc',
			secretIds: ['API_TOKEN'],
			secretsPath: '/tmp/langflower.secrets.json',
		});

		const late = await firstValueFrom(service.config$);

		expect(Object.keys(late.provider ?? {})).toEqual(
			expect.arrayContaining(['lmstudio', 'openai']),
		);
		expect(service.config().provider?.['lmstudio']?.name).toBe('LM Studio');
		expect(service.layers().globalPath).toBe(
			'/tmp/global-langflower.jsonc',
		);
		expect(service.layers().secretIds).toEqual(['API_TOKEN']);
		expect(service.layers().secretsPath).toBe(
			'/tmp/langflower.secrets.json',
		);
		expect(service.layers().projectConfig.provider?.['openai']?.name).toBe(
			'OpenAI',
		);
	});

	it('updates from session.state.snapshot.langflowerConfig', () => {
		cached['session.state.snapshot'].next({
			langflowerConfig: {
				provider: {
					lmstudio: { name: 'LM Studio' },
				},
			},
		});

		expect(service.config().provider?.['lmstudio']?.name).toBe('LM Studio');
	});

	it('replaces config when a newer snapshot arrives', async () => {
		cached['langflower.config.snapshot'].next({
			config: {
				provider: { openai: { name: 'OpenAI' } },
			},
			projectConfig: {
				provider: { openai: { name: 'OpenAI' } },
			},
			globalConfig: {},
			globalPath: '/a',
			secretIds: [],
			secretsPath: '/a-secrets.json',
		});

		const next = firstValueFrom(service.config$.pipe(skip(1)));

		cached['langflower.config.snapshot'].next({
			config: {
				provider: { lmstudio: { name: 'LM Studio' } },
			},
			projectConfig: {
				provider: { lmstudio: { name: 'LM Studio' } },
			},
			globalConfig: {},
			globalPath: '/b',
			secretIds: ['KEPT'],
			secretsPath: '/b-secrets.json',
		});

		await expect(next).resolves.toEqual({
			provider: { lmstudio: { name: 'LM Studio' } },
		});
		expect(service.config().provider?.['openai']).toBeUndefined();
		expect(service.layers().globalPath).toBe('/b');
		expect(service.layers().secretIds).toEqual(['KEPT']);
		expect(service.layers().secretsPath).toBe('/b-secrets.json');
	});
});
