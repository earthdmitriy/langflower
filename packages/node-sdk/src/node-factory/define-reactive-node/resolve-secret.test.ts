import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResolveSecret } from './resolve-secret.js';
import { isValidSecretId as toolsIsValid } from '../../../../tools/src/secrets/secret-id.js';

const SECRET_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

describe('createResolveSecret', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('matches tools secret-id charset', () => {
		const cases = [
			'API_TOKEN',
			'_private',
			'a1',
			'',
			'API-TOKEN',
			'1TOKEN',
			'API TOKEN',
			'A',
			'a_b',
		];
		for (const id of cases) {
			expect(SECRET_ID_RE.test(id)).toBe(toolsIsValid(id));
		}
	});

	it('resolves lf_secret from the closed-over bag', () => {
		const resolveSecret = createResolveSecret({
			secrets: { API_TOKEN: 'sk-live' },
			env: {},
		});
		expect(resolveSecret('lf_secret:API_TOKEN')).toEqual({
			ok: true,
			value: 'sk-live',
		});
		expect(resolveSecret('lf_secrets: API_TOKEN')).toEqual({
			ok: true,
			value: 'sk-live',
		});
	});

	it('resolves env without exposing other env keys to the caller', () => {
		const resolveSecret = createResolveSecret({
			secrets: {},
			env: { API_TOKEN: 'from-env', OTHER: 'nope' },
		});
		expect(resolveSecret('env:API_TOKEN')).toEqual({
			ok: true,
			value: 'from-env',
		});
		expect(resolveSecret('env:MISSING')).toEqual({
			ok: false,
			message: 'Environment variable MISSING is not set',
		});
	});

	it('does not fall through lf_secret to env', () => {
		const resolveSecret = createResolveSecret({
			secrets: {},
			env: { API_TOKEN: 'from-env' },
		});
		expect(resolveSecret('lf_secret:API_TOKEN')).toEqual({
			ok: false,
			message: 'Secret API_TOKEN is not set',
		});
	});

	it('reads process.env for env: when deps.env is omitted', () => {
		vi.stubEnv('API_TOKEN', 'from-process');
		const resolveSecret = createResolveSecret({ secrets: {} });
		expect(resolveSecret('env:API_TOKEN')).toEqual({
			ok: true,
			value: 'from-process',
		});
	});

	it('rejects invalid refs without echoing values', () => {
		const resolveSecret = createResolveSecret({
			secrets: { API_TOKEN: 'sk-live' },
			env: {},
		});
		expect(resolveSecret('')).toEqual({
			ok: false,
			message: 'Secret ref is invalid',
		});
		expect(resolveSecret('API_TOKEN')).toEqual({
			ok: false,
			message: 'Secret ref is invalid',
		});
		expect(resolveSecret('other:API_TOKEN')).toEqual({
			ok: false,
			message: 'Secret ref is invalid',
		});
		expect(resolveSecret('lf_secret:API-TOKEN')).toEqual({
			ok: false,
			message: 'Secret id API-TOKEN is invalid',
		});
		const missing = resolveSecret('lf_secret:MISSING');
		expect(missing).toEqual({
			ok: false,
			message: 'Secret MISSING is not set',
		});
		if (!missing.ok) {
			expect(missing.message).not.toContain('sk-live');
		}
	});
});
