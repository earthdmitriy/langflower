import { describe, expect, it } from 'vitest';
import { resolveChatProviderModel } from './resolve-chat-provider-model.js';

describe('resolveChatProviderModel', () => {
	it('prefers non-empty node params', () => {
		expect(
			resolveChatProviderModel(
				{ providerId: 'openai', model: 'gpt-4o' },
				{
					defaultChat: {
						providerId: 'lmstudio',
						model: 'local',
					},
				},
			),
		).toEqual({ providerId: 'openai', model: 'gpt-4o' });
	});

	it('falls back to host defaultChat when params are empty', () => {
		expect(
			resolveChatProviderModel(
				{ providerId: '', model: '' },
				{
					defaultChat: {
						providerId: 'lmstudio',
						model: 'local-model',
					},
				},
			),
		).toEqual({ providerId: 'lmstudio', model: 'local-model' });
	});

	it('fills only the empty field from default', () => {
		expect(
			resolveChatProviderModel(
				{ providerId: 'openai', model: '' },
				{
					defaultChat: {
						providerId: 'lmstudio',
						model: 'gpt-4o-mini',
					},
				},
			),
		).toEqual({ providerId: 'openai', model: 'gpt-4o-mini' });
	});

	it('returns empty strings when neither params nor default exist', () => {
		expect(resolveChatProviderModel({}, undefined)).toEqual({
			providerId: '',
			model: '',
		});
	});
});
