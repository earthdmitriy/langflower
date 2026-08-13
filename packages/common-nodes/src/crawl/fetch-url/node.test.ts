import type { ExecutionContext } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { filter, firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stringNode } from '../../primitives/string/node.js';
import { fetchUrlNode } from './node.js';

const mockWebFetch = vi.hoisted(() => vi.fn());

vi.mock('@langflower/tools/create-web-fetch', () => ({
	createWebFetch: () => mockWebFetch,
}));

describe('common-fetch-url', () => {
	beforeEach(() => {
		mockWebFetch.mockReset();
	});

	it('emits text from mocked webFetch (offline)', async () => {
		mockWebFetch.mockResolvedValue({
			ok: true,
			status: 200,
			url: 'https://example.com/doc',
			headers: { 'content-type': 'text/html' },
			body: '<html><body><h1>Hello</h1><script>x()</script></body></html>',
		});

		const instance = fetchUrlNode.getInstance();
		const ctx: ExecutionContext<typeof fetchUrlNode.uiSchema> = {
			projectDir: '/tmp',
			runId: 'test',
			nodeId: 'fetch-1',
			params: { timeoutMs: 5_000, maxBytes: 1_000_000 },
			uiSchema: fetchUrlNode.uiSchema,
		};

		instance.ctxConnection.connect(of(ctx));
		instance.inputs.url.connect(of('https://example.com/doc'));

		await expect(
			firstValueFrom(instance.outputs.text.value$),
		).resolves.toBe('Hello');
		await expect(
			firstValueFrom(instance.outputs.html.value$),
		).resolves.toContain('<h1>Hello</h1>');
		await expect(
			firstValueFrom(instance.outputs.status.value$),
		).resolves.toBe(200);
		expect(mockWebFetch).toHaveBeenCalledWith({
			url: 'https://example.com/doc',
			timeoutMs: 5_000,
			maxBytes: 1_000_000,
		});
	});

	it('errors when webFetch returns failure with empty body', async () => {
		mockWebFetch.mockResolvedValue({
			ok: false,
			status: 503,
			url: 'https://example.com',
			headers: {},
			body: '',
			error: 'Service unavailable',
		});

		const runtime = new RuntimeFacade({ log: false });
		const url = stringNode.getInstance();
		const fetch = fetchUrlNode.getInstance();

		url.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'url-1',
				params: {},
				uiSchema: stringNode.uiSchema,
			}),
		);
		fetch.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'fetch-1',
				params: {},
				uiSchema: fetchUrlNode.uiSchema,
			}),
		);
		url.inputs.value.connect(of('https://example.com'));

		runtime.editor.addNode({
			nodeId: 'url-1',
			inputs: url.inputs,
			outputs: url.outputs,
			bypassPorts: url.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'fetch-1',
			inputs: fetch.inputs,
			outputs: fetch.outputs,
			bypassPorts: fetch.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'url-1',
			fromPort: ['value', 0],
			toNodeId: 'fetch-1',
			toPort: ['url', 0],
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'error' &&
						event[1] === 'fetch-1',
				),
			),
		);

		runtime.runner.start();
		const errorEvent = await errorPromise;
		expect(String(errorEvent[4])).toMatch(/Service unavailable/i);
	});
});
