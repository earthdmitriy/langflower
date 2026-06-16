import { describe, expect, it } from 'vitest';
import {
	configToDraft,
	defaultProviderStaticModelIds,
	draftAfterLayerSnapshot,
	draftToSavePayload,
	sameDraft,
	type SettingsDraft,
} from '../utils/settings-draft';

const emptyDraft = (): SettingsDraft => configToDraft({});

describe('configToDraft', () => {
	it('never copies apiKey into the draft (write-only)', () => {
		const draft = configToDraft({
			provider: {
				openai: {
					name: 'OpenAI',
					models: ['gpt-4o-mini'],
					hasApiKey: true,
					options: { apiKey: 'sk-should-not-appear' },
				},
			},
		});

		expect(draft.providers).toEqual([
			{
				id: 'openai',
				name: 'OpenAI',
				baseURL: '',
				modelsText: 'gpt-4o-mini',
				apiKey: '',
				hasApiKey: true,
			},
		]);
		expect(draft.serverLogs).toBe('default');
		expect(draft.defaultProviderId).toBe('');
		expect(draft.defaultModelId).toBe('');
	});

	it('splits composite model into default provider/model selects', () => {
		const draft = configToDraft({ model: 'lmstudio/local-model' });
		expect(draft.defaultProviderId).toBe('lmstudio');
		expect(draft.defaultModelId).toBe('local-model');
	});

	it('maps serverLogs boolean to Off/On and omit to Default', () => {
		expect(configToDraft({ serverLogs: true }).serverLogs).toBe('on');
		expect(configToDraft({ serverLogs: false }).serverLogs).toBe('off');
		expect(configToDraft({}).serverLogs).toBe('default');
	});
});

describe('draftToSavePayload', () => {
	it('collects non-empty providerApiKeys and omits empty apiKey fields', () => {
		const draft: SettingsDraft = {
			...emptyDraft(),
			providers: [
				{
					id: 'openai',
					name: 'OpenAI',
					baseURL: 'https://api.openai.com/v1',
					modelsText: 'gpt-4o-mini',
					apiKey: '  sk-live  ',
					hasApiKey: false,
				},
				{
					id: 'local',
					name: 'Local',
					baseURL: '',
					modelsText: '',
					apiKey: '   ',
					hasApiKey: true,
				},
			],
		};

		const payload = draftToSavePayload('project', draft);

		expect(payload.providerApiKeys).toEqual({ openai: 'sk-live' });
		expect(payload.provider['openai']).toEqual({
			name: 'OpenAI',
			models: ['gpt-4o-mini'],
			options: { baseURL: 'https://api.openai.com/v1' },
		});
		expect(payload.provider['local']).toEqual({ name: 'Local' });
		expect(payload.serverLogs).toBeNull();
	});

	it('composes default provider/model into model on save', () => {
		const payload = draftToSavePayload('project', {
			...emptyDraft(),
			defaultProviderId: 'openai',
			defaultModelId: 'gpt-4o-mini',
		});
		expect(payload.model).toBe('openai/gpt-4o-mini');
	});

	it('sends empty model when default selects are incomplete (clear layer)', () => {
		expect(
			draftToSavePayload('project', {
				...emptyDraft(),
				defaultProviderId: 'openai',
				defaultModelId: '',
			}).model,
		).toBe('');
	});

	it('marks draft dirty when default provider/model change', () => {
		const baseline = configToDraft({
			model: 'lmstudio/local-model',
			provider: {
				lmstudio: { name: 'LM Studio', models: ['local-model'] },
			},
		});
		const edited: SettingsDraft = {
			...baseline,
			defaultModelId: 'other-model',
		};
		expect(sameDraft(baseline, edited)).toBe(false);
	});

	it('maps serverLogs draft radio to boolean or null clear', () => {
		expect(
			draftToSavePayload('project', {
				...emptyDraft(),
				serverLogs: 'on',
			}).serverLogs,
		).toBe(true);
		expect(
			draftToSavePayload('global', {
				...emptyDraft(),
				serverLogs: 'off',
			}).serverLogs,
		).toBe(false);
		expect(
			draftToSavePayload('project', {
				...emptyDraft(),
				serverLogs: 'default',
			}).serverLogs,
		).toBeNull();
	});
});

describe('defaultProviderStaticModelIds', () => {
	it('reads comma-separated models for the selected default provider', () => {
		const draft: SettingsDraft = {
			...emptyDraft(),
			defaultProviderId: 'openai',
			providers: [
				{
					id: 'openai',
					name: 'OpenAI',
					baseURL: '',
					modelsText: 'a, b',
					apiKey: '',
					hasApiKey: false,
				},
			],
		};
		expect(defaultProviderStaticModelIds(draft)).toEqual(['a', 'b']);
	});
});

describe('draftAfterLayerSnapshot', () => {
	it('replaces a pristine draft with the layer snapshot', () => {
		const baseline = emptyDraft();
		const next = configToDraft({
			model: 'openai/gpt-4o-mini',
			provider: {
				openai: { name: 'OpenAI', hasApiKey: true, models: ['m'] },
			},
		});

		expect(draftAfterLayerSnapshot(baseline, baseline, next)).toEqual(next);
	});

	it('clears typed apiKey and aligns after Save-shaped snapshot', () => {
		const baseline = configToDraft({
			model: 'openai/gpt-4o-mini',
			provider: {
				openai: {
					name: 'OpenAI',
					models: ['gpt-4o-mini'],
					hasApiKey: false,
				},
			},
		});
		const dirty: SettingsDraft = {
			...baseline,
			providers: [
				{
					...baseline.providers[0]!,
					apiKey: 'sk-secret',
				},
			],
		};
		const next = configToDraft({
			model: 'openai/gpt-4o-mini',
			provider: {
				openai: {
					name: 'OpenAI',
					models: ['gpt-4o-mini'],
					hasApiKey: true,
				},
			},
		});

		const aligned = draftAfterLayerSnapshot(dirty, baseline, next);

		expect(aligned).toEqual(next);
		expect(aligned.providers[0]?.apiKey).toBe('');
		expect(aligned.providers[0]?.hasApiKey).toBe(true);
		expect(sameDraft(aligned, next)).toBe(true);
	});

	it('keeps other dirty fields while clearing apiKey on external snapshot', () => {
		const baseline = configToDraft({
			model: 'old/model',
			provider: {
				openai: { name: 'OpenAI', hasApiKey: true },
			},
		});
		const dirty: SettingsDraft = {
			...baseline,
			defaultProviderId: 'edited',
			defaultModelId: 'model',
			providers: [
				{
					...baseline.providers[0]!,
					apiKey: 'sk-typing',
				},
			],
		};
		const next = configToDraft({
			model: 'other-tab/model',
			provider: {
				openai: { name: 'OpenAI', hasApiKey: true },
			},
		});

		const aligned = draftAfterLayerSnapshot(dirty, baseline, next);

		expect(aligned.defaultProviderId).toBe('edited');
		expect(aligned.defaultModelId).toBe('model');
		expect(aligned.providers[0]?.apiKey).toBe('');
		expect(aligned.providers[0]?.hasApiKey).toBe(true);
		expect(sameDraft(aligned, next)).toBe(false);
	});
});
