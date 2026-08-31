import { describe, expect, it } from 'vitest';
import { interpolatePlaceholders } from './interpolate-placeholders.js';

describe('interpolatePlaceholders', () => {
	it('replaces lf_secrets and env as substrings', () => {
		const result = interpolatePlaceholders(
			'Bearer {lf_secrets:API_TOKEN} host={env:HOST}',
			{
				secrets: { API_TOKEN: 'sk-live' },
				env: { HOST: 'example.com' },
			},
		);

		expect(result).toEqual({
			ok: true,
			value: 'Bearer sk-live host=example.com',
		});
	});

	it('leaves strings without placeholders unchanged', () => {
		expect(
			interpolatePlaceholders('plain text', { secrets: {}, env: {} }),
		).toEqual({ ok: true, value: 'plain text' });
	});

	it('leaves unknown and malformed braces as-is', () => {
		expect(
			interpolatePlaceholders('{other:X} {lf_secrets:} {env:}', {
				secrets: {},
				env: {},
			}),
		).toEqual({
			ok: true,
			value: '{other:X} {lf_secrets:} {env:}',
		});
	});

	it('does not re-scan replacement text', () => {
		const result = interpolatePlaceholders('{lf_secrets:API_TOKEN}', {
			secrets: { API_TOKEN: 'prefix-{env:HOST}' },
			env: { HOST: 'should-not-appear' },
		});

		expect(result).toEqual({
			ok: true,
			value: 'prefix-{env:HOST}',
		});
	});

	it('fails loud when a secret is missing', () => {
		const result = interpolatePlaceholders(
			'Bearer {lf_secrets:API_TOKEN}',
			{ secrets: {}, env: {} },
		);

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}

		expect(result.message).toContain('API_TOKEN');
		expect(result.message).not.toMatch(/sk-|Bearer /);
	});

	it('fails loud when a secret value is empty', () => {
		const result = interpolatePlaceholders('{lf_secrets:API_TOKEN}', {
			secrets: { API_TOKEN: '' },
			env: {},
		});

		expect(result).toEqual({
			ok: false,
			message: 'Secret API_TOKEN is not set',
		});
	});

	it('fails loud when env is missing', () => {
		const result = interpolatePlaceholders('x={env:MISSING_LF_VAR}', {
			secrets: {},
			env: {},
		});

		expect(result).toEqual({
			ok: false,
			message: 'Environment variable MISSING_LF_VAR is not set',
		});
	});

	it('fails loud when env value is empty', () => {
		const result = interpolatePlaceholders('{env:EMPTY_VAR}', {
			secrets: {},
			env: { EMPTY_VAR: '' },
		});

		expect(result).toEqual({
			ok: false,
			message: 'Environment variable EMPTY_VAR is not set',
		});
	});

	it('does not echo secret values in error messages', () => {
		const secret = 'sk-super-secret-value';
		const result = interpolatePlaceholders(
			'{lf_secrets:GOOD} then {lf_secrets:BAD}',
			{
				secrets: { GOOD: secret },
				env: {},
			},
		);

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}

		expect(result.message).not.toContain(secret);
		expect(result.message).toContain('BAD');
	});

	it('reads process.env when env is omitted', () => {
		const key = 'LF_INTERPOLATE_PLACEHOLDERS_TEST_VAR';
		const previous = process.env[key];
		process.env[key] = 'from-process';

		try {
			expect(
				interpolatePlaceholders(`n={env:${key}}`, { secrets: {} }),
			).toEqual({ ok: true, value: 'n=from-process' });
		} finally {
			if (previous === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = previous;
			}
		}
	});
});
