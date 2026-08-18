import type { ExecutionContext } from '@langflower/node-sdk';
import type {
	WebFetchRequest,
	WebFetchResult,
} from '@langflower/tools/create-web-fetch';
import { RuntimeFacade } from '@langflower/runtime';
import { filter, firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeNode } from '../flow/merge/node.js';
import { previewNode } from '../output/preview/node.js';
import { stringNode } from '../primitives/string/node.js';
import { fetchUrlNode } from './fetch-url/node.js';

const mockWebFetch = vi.hoisted(() => vi.fn());

vi.mock('@langflower/tools/create-web-fetch', () => ({
	createWebFetch: () => mockWebFetch,
}));

/**
 * AC1: at least one crawl path is runnable and mergeable (offline fixtures).
 * Two Fetch URL branches → Merge → Preview.
 */
describe('crawl + merge path', () => {
	beforeEach(() => {
		mockWebFetch.mockReset();
		const bodies: Readonly<Record<string, string>> = {
			'https://example.com/a': '<html><body>Alpha notes</body></html>',
			'https://example.com/b': '<html><body>Beta notes</body></html>',
		};
		mockWebFetch.mockImplementation(
			async (request: WebFetchRequest): Promise<WebFetchResult> => ({
				ok: true,
				status: 200,
				url: request.url,
				headers: {},
				body: bodies[request.url] ?? '',
			}),
		);
	});

	it('merges two mocked fetch texts', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const urlA = stringNode.getInstance();
		const urlB = stringNode.getInstance();
		const fetchA = fetchUrlNode.getInstance();
		const fetchB = fetchUrlNode.getInstance();
		const merge = mergeNode.getInstance();
		const preview = previewNode.getInstance();

		const seedCtx = (nodeId: string, uiSchema: readonly unknown[]) =>
			of({
				projectDir: '/tmp',
				runId: 'merge-crawl',
				nodeId,
				params: {},
				uiSchema,
			} as ExecutionContext<never>);

		urlA.ctxConnection.connect(seedCtx('url-a', stringNode.uiSchema));
		urlB.ctxConnection.connect(seedCtx('url-b', stringNode.uiSchema));
		fetchA.ctxConnection.connect(seedCtx('fetch-a', fetchUrlNode.uiSchema));
		fetchB.ctxConnection.connect(seedCtx('fetch-b', fetchUrlNode.uiSchema));
		merge.ctxConnection.connect(seedCtx('merge-1', mergeNode.uiSchema));
		preview.ctxConnection.connect(
			seedCtx('preview-1', previewNode.uiSchema),
		);

		urlA.inputs.value.connect(of('https://example.com/a'));
		urlB.inputs.value.connect(of('https://example.com/b'));

		for (const [nodeId, node] of [
			['url-a', urlA],
			['url-b', urlB],
			['fetch-a', fetchA],
			['fetch-b', fetchB],
			['merge-1', merge],
			['preview-1', preview],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: node.inputs,
				outputs: node.outputs,
				bypassPorts: node.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'url-a',
			fromPort: ['value', 0],
			toNodeId: 'fetch-a',
			toPort: ['url', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'url-b',
			fromPort: ['value', 0],
			toNodeId: 'fetch-b',
			toPort: ['url', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'fetch-a',
			fromPort: ['text', 0],
			toNodeId: 'merge-1',
			toPort: ['value', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'fetch-b',
			fromPort: ['text', 0],
			toNodeId: 'merge-1',
			toPort: ['value', 1],
		});
		runtime.editor.addEdge({
			fromNodeId: 'merge-1',
			fromPort: ['value', 0],
			toNodeId: 'preview-1',
			toPort: ['text', 0],
		});

		const merged: string[] = [];
		const done = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'value' in event[3] &&
						event[1] === 'preview-1' &&
						event[2] === 'text',
				),
			),
		);

		const sub = merge.outputs.value.value$.subscribe((value) => {
			merged.push(String(value));
		});

		runtime.runner.start();
		await done;
		sub.unsubscribe();

		expect(merged).toEqual(
			expect.arrayContaining(['Alpha notes', 'Beta notes']),
		);
		expect(mockWebFetch).toHaveBeenCalledTimes(2);
	});
});
