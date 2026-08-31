import { describe, expect, it } from 'vitest';
import { resolveMcpHttpHeaders } from './resolve-mcp-http-headers.js';

describe('resolveMcpHttpHeaders', () => {
	it('interpolates lf_secrets in header values', () => {
		expect(
			resolveMcpHttpHeaders(
				{ Authorization: 'Bearer {lf_secrets:API_TOKEN}' },
				{ secrets: { API_TOKEN: 'sk-live' }, env: {} },
			),
		).toEqual({
			ok: true,
			headers: { Authorization: 'Bearer sk-live' },
		});
	});

	it('accepts a JSON string', () => {
		expect(
			resolveMcpHttpHeaders('{"Authorization":"Bearer {env:TOKEN}"}', {
				secrets: {},
				env: { TOKEN: 'from-env' },
			}),
		).toEqual({
			ok: true,
			headers: { Authorization: 'Bearer from-env' },
		});
	});

	it('treats empty string and empty object as no headers', () => {
		expect(resolveMcpHttpHeaders('', { secrets: {}, env: {} })).toEqual({
			ok: true,
			headers: {},
		});
		expect(resolveMcpHttpHeaders('{}', { secrets: {}, env: {} })).toEqual({
			ok: true,
			headers: {},
		});
		expect(
			resolveMcpHttpHeaders(undefined, { secrets: {}, env: {} }),
		).toEqual({ ok: true, headers: {} });
	});

	it('fails invalid JSON without echoing secrets', () => {
		const result = resolveMcpHttpHeaders('{not-json', {
			secrets: { API_TOKEN: 'sk-live' },
			env: {},
		});
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.message).toContain('invalid');
		expect(result.message).not.toContain('sk-live');
	});

	it('fails non-string header values', () => {
		expect(
			resolveMcpHttpHeaders(
				{ Authorization: 1 },
				{ secrets: {}, env: {} },
			),
		).toEqual({
			ok: false,
			message: 'MCP HTTP header values must be strings',
		});
	});

	it('fails missing secret without echoing other values', () => {
		const result = resolveMcpHttpHeaders(
			{
				Authorization: 'Bearer {lf_secrets:MISSING}',
			},
			{ secrets: { OTHER: 'sk-other' }, env: {} },
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}
		expect(result.message).toContain('MISSING');
		expect(result.message).not.toContain('sk-other');
	});

	it('does not interpolate header names', () => {
		expect(
			resolveMcpHttpHeaders(
				{ '{lf_secrets:API_TOKEN}': 'plain' },
				{ secrets: { API_TOKEN: 'sk-live' }, env: {} },
			),
		).toEqual({
			ok: true,
			headers: { '{lf_secrets:API_TOKEN}': 'plain' },
		});
	});
});
