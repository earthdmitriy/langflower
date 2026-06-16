import { describe, expect, it } from 'vitest';
import type { LangflowerConfig } from '@langflower/shared/langflower.js';
import { resolveProviderCredentials } from './resolve-provider-credentials.js';

const testConfig = (apiKey: string): LangflowerConfig => ({
	provider: {
		openai: {
			name: 'OpenAI',
			options: {
				baseURL: 'https://api.openai.com/v1',
				apiKey,
			},
		},
	},
});

describe('resolveProviderCredentials', () => {
	it('resolves {env:VAR} from process.env', () => {
		const prior = process.env.TEST_LF_KEY;
		process.env.TEST_LF_KEY = 'lf-test-key-value';

		try {
			expect(
				resolveProviderCredentials(
					testConfig('{env:TEST_LF_KEY}'),
					'openai',
				),
			).toEqual({
				ok: true,
				credentials: {
					apiKey: 'lf-test-key-value',
					baseURL: 'https://api.openai.com/v1',
				},
			});
		} finally {
			if (prior === undefined) {
				delete process.env.TEST_LF_KEY;
			} else {
				process.env.TEST_LF_KEY = prior;
			}
		}
	});

	it('passes through literal apiKey and baseURL', () => {
		expect(
			resolveProviderCredentials(testConfig('sk-static-key'), 'openai'),
		).toEqual({
			ok: true,
			credentials: {
				apiKey: 'sk-static-key',
				baseURL: 'https://api.openai.com/v1',
			},
		});
	});

	it('returns ok:false when env var is missing without echoing the secret', () => {
		const prior = process.env.MISSING_LF_SECRET_VAR;
		delete process.env.MISSING_LF_SECRET_VAR;

		try {
			const resolved = resolveProviderCredentials(
				testConfig('{env:MISSING_LF_SECRET_VAR}'),
				'openai',
			);

			expect(resolved).toEqual({
				ok: false,
				message: expect.stringMatching(
					/Environment variable MISSING_LF_SECRET_VAR is not set/,
				),
			});

			if (!resolved.ok) {
				expect(resolved.message).not.toContain('sk-');
				expect(resolved.message).not.toContain('secret');
			}
		} finally {
			if (prior !== undefined) {
				process.env.MISSING_LF_SECRET_VAR = prior;
			}
		}
	});

	it('returns ok:false when provider id is unknown', () => {
		expect(
			resolveProviderCredentials(testConfig('{env:TEST}'), 'unknown'),
		).toEqual({
			ok: false,
			message: 'Provider "unknown" is not configured',
		});
	});
});
