import { describe, expect, it } from 'vitest';
import { assertUrlSafeForFetch, isBlockedIpAddress } from './ssrf-guard.js';

describe('isBlockedIpAddress', () => {
	it.each([
		'127.0.0.1',
		'10.0.0.1',
		'192.168.1.1',
		'172.16.0.1',
		'169.254.169.254',
		'0.0.0.0',
		'::1',
		'fe80::1',
		'fc00::1',
	])('blocks %s', (ip) => {
		expect(isBlockedIpAddress(ip)).toBe(true);
	});

	it.each(['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888'])(
		'allows public %s',
		(ip) => {
			expect(isBlockedIpAddress(ip)).toBe(false);
		},
	);
});

describe('assertUrlSafeForFetch', () => {
	it('rejects non-http protocols', async () => {
		await expect(
			assertUrlSafeForFetch('file:///etc/passwd', { skipDns: true }),
		).rejects.toThrow(/protocol/i);
	});

	it('rejects localhost hostnames without DNS', async () => {
		await expect(
			assertUrlSafeForFetch('http://localhost/secret', { skipDns: true }),
		).rejects.toThrow(/hostname/i);
		await expect(
			assertUrlSafeForFetch('http://127.0.0.1/', { skipDns: true }),
		).rejects.toThrow(/IP/i);
	});

	it('enforces allowedHosts allowlist', async () => {
		await expect(
			assertUrlSafeForFetch('https://evil.example/x', {
				skipDns: true,
				allowedHosts: ['docs.example'],
			}),
		).rejects.toThrow(/allowedHosts/i);

		await expect(
			assertUrlSafeForFetch('https://docs.example/x', {
				skipDns: true,
				allowedHosts: ['docs.example'],
			}),
		).resolves.toMatchObject({
			url: expect.objectContaining({ hostname: 'docs.example' }),
		});
	});

	it('allows public hostnames when DNS skipped', async () => {
		const safe = await assertUrlSafeForFetch('https://example.com/path', {
			skipDns: true,
		});

		expect(safe.url.toString()).toBe('https://example.com/path');
		expect(safe.pinnedAddresses).toEqual([]);
	});

	it('pins literal public IPs', async () => {
		const safe = await assertUrlSafeForFetch('https://8.8.8.8/');

		expect(safe.pinnedAddresses).toEqual(['8.8.8.8']);
	});
});
