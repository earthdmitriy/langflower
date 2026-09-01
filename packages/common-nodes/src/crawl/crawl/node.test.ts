import {
	emptyResolveSecret,
	type ExecutionContext,
} from '@langflower/node-sdk';
import type {
	WebFetchRequest,
	WebFetchResult,
} from '@langflower/tools/create-web-fetch';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crawlNode } from './node.js';

const mockWebFetch = vi.hoisted(() => vi.fn());
const mockSavePage = vi.hoisted(() => vi.fn());

vi.mock('@langflower/tools/create-web-fetch', () => ({
	createWebFetch: () => mockWebFetch,
}));

vi.mock('@langflower/tools/create-crawl-context', () => ({
	createCrawlContext: () => ({
		runId: 'test',
		savePage: mockSavePage,
	}),
}));

const pages: Readonly<Record<string, string>> = {
	'https://example.com/':
		'<html><title>Home</title><body><a href="/a">A</a><a href="https://other.example/x">X</a></body></html>',
	'https://example.com/a': '<html><title>A</title><body>Page A</body></html>',
};

describe('common-crawl', () => {
	beforeEach(() => {
		mockWebFetch.mockReset();
		mockSavePage.mockReset();
		mockWebFetch.mockImplementation(
			async (request: WebFetchRequest): Promise<WebFetchResult> => {
				const body = pages[request.url] ?? '';

				return {
					ok: body.length > 0,
					status: body.length > 0 ? 200 : 404,
					url: request.url,
					headers: {},
					body,
					...(body.length === 0 ? { error: 'missing' } : {}),
				};
			},
		);
		mockSavePage.mockImplementation(async (page) => ({
			...page,
			savedPath: `.langflower/crawl/test/${encodeURIComponent(page.url)}.json`,
		}));
	});

	it('BFS crawls with mocked webFetch and merges pages (offline)', async () => {
		const instance = crawlNode.getInstance();
		const ctx: ExecutionContext<typeof crawlNode.uiSchema> = {
			projectDir: '/tmp',
			runId: 'test',
			nodeId: 'crawl-1',
			params: {
				maxDepth: 1,
				maxPages: 4,
				sameHostOnly: true,
				timeoutMs: 5_000,
				maxBytes: 1_000_000,
			},
			uiSchema: crawlNode.uiSchema,
			resolveSecret: emptyResolveSecret,
		};

		instance.ctxConnection.connect(of(ctx));
		instance.inputs.startUrl.connect(of('https://example.com/'));

		const result = await firstValueFrom(instance.outputs.pages.value$);

		expect(result).toHaveLength(2);
		expect(result.map((page: { url: string }) => page.url)).toEqual([
			'https://example.com/',
			'https://example.com/a',
		]);
		expect(mockSavePage).toHaveBeenCalledTimes(2);
		expect(mockWebFetch).toHaveBeenCalled();
	});
});
