import {
	emptyResolveSecret,
	type ExecutionContext,
} from '@langflower/node-sdk';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { savePageNode } from './node.js';

vi.mock('@langflower/tools/create-crawl-context', () => ({
	createCrawlContext: vi.fn(),
}));

import { createCrawlContext } from '@langflower/tools/create-crawl-context';

const createCrawlContextMock = vi.mocked(createCrawlContext);

describe('common-save-page', () => {
	it('persists via createCrawlContext (offline)', async () => {
		const savePage = vi.fn(async (page) => ({
			...page,
			savedPath: '.langflower/crawl/test/0001.json',
		}));
		createCrawlContextMock.mockReturnValue({
			runId: 'test',
			savePage,
		});

		const instance = savePageNode.getInstance();
		const ctx: ExecutionContext<typeof savePageNode.uiSchema> = {
			projectDir: '/tmp',
			runId: 'test',
			nodeId: 'save-1',
			params: {},
			uiSchema: savePageNode.uiSchema,
			resolveSecret: emptyResolveSecret,
		};

		instance.ctxConnection.connect(of(ctx));
		instance.inputs.url.connect(of('https://example.com/p'));
		instance.inputs.html.connect(of('<html><title>T</title></html>'));
		instance.inputs.text.connect(of('T'));

		const saved = await firstValueFrom(instance.outputs.saved.value$);

		expect(createCrawlContextMock).toHaveBeenCalledWith('/tmp', 'test');
		expect(saved).toMatchObject({
			url: 'https://example.com/p',
			title: 'T',
			savedPath: '.langflower/crawl/test/0001.json',
		});
		expect(savePage).toHaveBeenCalledTimes(1);
	});
});
