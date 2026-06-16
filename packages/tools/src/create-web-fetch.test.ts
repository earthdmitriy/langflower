import { describe, expect, it, vi } from 'vitest';
import { createWebFetch } from './create-web-fetch.js';

describe('createWebFetch', () => {
	it('returns body from a mocked public fetch (offline)', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response('<html><body>Hi</body></html>', {
					status: 200,
					headers: { 'content-type': 'text/html' },
				}),
		) as unknown as typeof fetch;

		// Public IP literal avoids DNS; fetch is mocked.
		const webFetch = createWebFetch({ fetchImpl });
		const result = await webFetch({ url: 'https://8.8.8.8/' });

		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(result.body).toContain('Hi');
		expect(fetchImpl).toHaveBeenCalled();
	});

	it('does not call fetch for blocked URLs', async () => {
		const fetchImpl = vi.fn() as unknown as typeof fetch;
		const webFetch = createWebFetch({ fetchImpl });
		const result = await webFetch({ url: 'http://127.0.0.1/admin' });

		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/Blocked/i);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('re-validates redirect targets', async () => {
		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);

			if (url.includes('8.8.8.8')) {
				return new Response(null, {
					status: 302,
					headers: { location: 'http://127.0.0.1/secret' },
				});
			}

			return new Response('should-not-reach', { status: 200 });
		}) as unknown as typeof fetch;

		const webFetch = createWebFetch({ fetchImpl });
		const result = await webFetch({ url: 'https://8.8.8.8/' });

		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/Blocked/i);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});
