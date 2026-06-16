import { describe, expect, it, vi } from 'vitest';
import type { WebFetchRequest, WebFetchResult } from '../create-web-fetch.js';
import { runBfsCrawl } from './run-bfs-crawl.js';

const pages: Readonly<Record<string, string>> = {
	'https://example.com/':
		'<html><title>Home</title><body><a href="/a">A</a><a href="/b">B</a><a href="https://other.example/x">X</a></body></html>',
	'https://example.com/a':
		'<html><title>A</title><body><a href="/c">C</a></body></html>',
	'https://example.com/b': '<html><title>B</title><body>Page B</body></html>',
	'https://example.com/c': '<html><title>C</title><body>Page C</body></html>',
};

const mockWebFetch = (
	bodies: Readonly<Record<string, string>> = pages,
): ((request: WebFetchRequest) => Promise<WebFetchResult>) =>
	vi.fn(async (request: WebFetchRequest): Promise<WebFetchResult> => {
		const body = bodies[request.url] ?? '';

		return {
			ok: body.length > 0,
			status: body.length > 0 ? 200 : 404,
			url: request.url,
			headers: {},
			body,
			...(body.length === 0 ? { error: 'missing' } : {}),
		};
	});

describe('runBfsCrawl', () => {
	it('graph contract: respects maxDepth and returns full page payload', async () => {
		const webFetch = mockWebFetch();
		const savePage = vi.fn(async (page) => ({
			savedPath: `saved/${encodeURIComponent(page.url)}.json`,
		}));

		const result = await runBfsCrawl({
			startUrl: 'https://example.com/',
			maxDepth: 1,
			maxPages: 10,
			sameHostOnly: true,
			failureMode: 'skip',
			enqueueBudget: 'maxPages',
			webFetch,
			savePage,
		});

		expect(result.every((page) => page.ok)).toBe(true);
		expect(result.map((page) => page.url)).toEqual([
			'https://example.com/',
			'https://example.com/a',
			'https://example.com/b',
		]);
		expect(result[0]).toMatchObject({
			ok: true,
			title: 'Home',
			status: 200,
			text: expect.stringContaining('A'),
			savedPath: 'saved/https%3A%2F%2Fexample.com%2F.json',
		});
		expect(savePage).toHaveBeenCalledTimes(3);
		expect(
			result.some((page) => page.url === 'https://example.com/c'),
		).toBe(false);
	});

	it('tool contract: no depth, slim-ready pages, records fetch errors', async () => {
		const webFetch = vi.fn(
			async (request: WebFetchRequest): Promise<WebFetchResult> => {
				if (request.url === 'https://example.com/a') {
					return {
						ok: false,
						status: 500,
						url: request.url,
						headers: {},
						body: '',
						error: 'boom',
					};
				}

				return mockWebFetch()(request);
			},
		);

		const result = await runBfsCrawl({
			startUrl: 'https://example.com/',
			maxPages: 4,
			sameHostOnly: true,
			failureMode: 'record',
			enqueueBudget: 'unlimited',
			webFetch,
		});

		expect(result.map((page) => page.url)).toEqual([
			'https://example.com/',
			'https://example.com/a',
			'https://example.com/b',
		]);
		expect(result[0]).toMatchObject({
			ok: true,
			url: 'https://example.com/',
			title: 'Home',
		});
		expect(result[1]).toEqual({
			ok: false,
			url: 'https://example.com/a',
			error: 'boom',
			depth: 1,
		});
		expect(result[2]).toMatchObject({
			ok: true,
			url: 'https://example.com/b',
			title: 'B',
		});
		// Failed pages do not expand links — `/c` only linked from `/a`.
		expect(
			result.some((page) => page.url === 'https://example.com/c'),
		).toBe(false);
	});

	it('skip mode omits empty failed fetches without error records', async () => {
		const webFetch = vi.fn(
			async (request: WebFetchRequest): Promise<WebFetchResult> => {
				if (request.url === 'https://example.com/a') {
					return {
						ok: false,
						status: 404,
						url: request.url,
						headers: {},
						body: '',
						error: 'missing',
					};
				}

				return mockWebFetch()(request);
			},
		);

		const result = await runBfsCrawl({
			startUrl: 'https://example.com/',
			maxDepth: 1,
			maxPages: 10,
			failureMode: 'skip',
			enqueueBudget: 'maxPages',
			webFetch,
		});

		expect(result.map((page) => page.url)).toEqual([
			'https://example.com/',
			'https://example.com/b',
		]);
		expect(result.every((page) => page.ok)).toBe(true);
	});

	it('enqueueBudget maxPages limits frontier growth', async () => {
		const webFetch = mockWebFetch();

		const result = await runBfsCrawl({
			startUrl: 'https://example.com/',
			maxDepth: 5,
			maxPages: 2,
			failureMode: 'skip',
			enqueueBudget: 'maxPages',
			webFetch,
		});

		expect(result).toHaveLength(2);
		expect(webFetch).toHaveBeenCalledTimes(2);
	});
});
