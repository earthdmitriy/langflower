import { describe, expect, it } from 'vitest';
import type { LangflowerConfig } from '@langflower/shared/langflower.js';
import { redactLangflowerConfigForBridge } from './redact-langflower-config.js';
import { resolveProviderCredentials } from './resolve-provider-credentials.js';

const configWithSecrets = (): LangflowerConfig => ({
	model: 'openai/gpt-4o-mini',
	provider: {
		openai: {
			name: 'OpenAI',
			options: {
				baseURL: 'https://api.openai.com/v1',
				apiKey: '{env:OPENAI_API_KEY}',
			},
			models: ['gpt-4o-mini'],
		},
		literal: {
			name: 'Literal key provider',
			options: {
				apiKey: 'sk-live-secret-key-value',
			},
			models: ['test-model'],
		},
	},
});

describe('redactLangflowerConfigForBridge', () => {
	it('omits apiKey from provider options (env ref and literal)', () => {
		const redacted = redactLangflowerConfigForBridge(configWithSecrets());

		expect(redacted.provider?.openai).toEqual({
			name: 'OpenAI',
			options: { baseURL: 'https://api.openai.com/v1' },
			models: ['gpt-4o-mini'],
			hasApiKey: true,
		});
		expect(redacted.provider?.literal).toEqual({
			name: 'Literal key provider',
			models: ['test-model'],
			hasApiKey: true,
		});
		expect(redacted.provider?.openai?.options).not.toHaveProperty('apiKey');
		expect(redacted.provider?.literal).not.toHaveProperty('options');
	});

	it('sets hasApiKey when a secret was present', () => {
		const redacted = redactLangflowerConfigForBridge(configWithSecrets());
		expect(redacted.provider?.openai?.hasApiKey).toBe(true);
		expect(redacted.provider?.literal?.hasApiKey).toBe(true);
	});

	it('resolved credentials never appear in redacted snapshot payload', () => {
		const prior = process.env.TEST_LF_KEY;
		process.env.TEST_LF_KEY = 'resolved-secret-value';

		try {
			const config: LangflowerConfig = {
				provider: {
					test: {
						name: 'Test',
						options: { apiKey: '{env:TEST_LF_KEY}' },
					},
				},
			};

			const resolved = resolveProviderCredentials(config, 'test');
			const redacted = redactLangflowerConfigForBridge(config);
			const serialized = JSON.stringify(redacted);

			expect(resolved).toEqual({
				ok: true,
				credentials: { apiKey: 'resolved-secret-value' },
			});
			expect(serialized).not.toContain('resolved-secret-value');
			expect(serialized).not.toContain('TEST_LF_KEY');
			expect(redacted.provider?.test?.options).toBeUndefined();
		} finally {
			if (prior === undefined) {
				delete process.env.TEST_LF_KEY;
			} else {
				process.env.TEST_LF_KEY = prior;
			}
		}
	});
});
