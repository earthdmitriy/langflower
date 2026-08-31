import { contextSymbol } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catchError, EMPTY, filter, firstValueFrom, of, timeout } from 'rxjs';
import { attachRunHostServices } from '../../ai/features/run-host-services.js';
import { mcpHttpNode } from './node.js';

vi.mock('@langflower/tools/mcp-http-client', async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import('@langflower/tools/mcp-http-client')
		>();
	return {
		...actual,
		connectMcpHttpWithOptionalLaunch: vi.fn(),
	};
});

vi.mock('@langflower/tools/build-mcp-handle', () => ({
	buildMcpHandle: vi.fn(),
}));

import { connectMcpHttpWithOptionalLaunch } from '@langflower/tools/mcp-http-client';
import { buildMcpHandle } from '@langflower/tools/build-mcp-handle';

const connectMock = vi.mocked(connectMcpHttpWithOptionalLaunch);
const buildMock = vi.mocked(buildMcpHandle);

describe('common-mcp-http connect errors (S5)', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('emits output-emitted error when connect fails', async () => {
		connectMock.mockRejectedValue(new Error('fetch failed'));

		const runtime = new RuntimeFacade({ log: false });
		const mcp = mcpHttpNode.getInstance();
		mcp.inputs.url.connect(of('http://127.0.0.1:9/mcp'));

		runtime.editor.addNode({
			nodeId: 'mcp-http-1',
			inputs: mcp.inputs,
			outputs: mcp.outputs,
			bypassPorts: mcp.bypassPorts,
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'error' in event[3] &&
						event[1] === 'mcp-http-1' &&
						event[2] === 'tools',
				),
			),
		);

		runtime.runner.start({
			'mcp-http-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'mcp-http-1',
						params: {},
						uiSchema: mcpHttpNode.uiSchema,
					},
				},
			],
		});

		const failed = await errorPromise;
		expect(String(failed[3].error)).toMatch(/MCP http connect failed/);
		expect(String(failed[3].error)).toContain('mcp-http-1');
		expect(String(failed[3].error)).toContain('fetch failed');
		expect(buildMock).not.toHaveBeenCalled();
		expect(connectMock.mock.calls[0]?.[0]).not.toHaveProperty('headers');

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('does not emit port error when url is empty', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const mcp = mcpHttpNode.getInstance();
		mcp.inputs.url.connect(of(''));

		runtime.editor.addNode({
			nodeId: 'mcp-http-1',
			inputs: mcp.inputs,
			outputs: mcp.outputs,
			bypassPorts: mcp.bypassPorts,
		});

		const sawError = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'error' in event[3] &&
						event[1] === 'mcp-http-1',
				),
				timeout({ first: 200 }),
				catchError(() => EMPTY),
			),
		).then(
			(event) => event,
			() => undefined,
		);

		runtime.runner.start({
			'mcp-http-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'mcp-http-1',
						params: {},
						uiSchema: mcpHttpNode.uiSchema,
					},
				},
			],
		});

		expect(await sawError).toBeUndefined();
		expect(connectMock).not.toHaveBeenCalled();

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('forwards interpolated headers and omits empty headers', async () => {
		connectMock.mockResolvedValue({
			client: { close: async () => undefined },
			close: async () => undefined,
		});
		buildMock.mockResolvedValue([]);

		const runtime = new RuntimeFacade({ log: false });
		const mcp = mcpHttpNode.getInstance();
		mcp.inputs.url.connect(of('http://127.0.0.1:9/mcp'));
		mcp.inputs.headers.connect(
			of('{"Authorization":"Bearer {lf_secrets:API_TOKEN}"}'),
		);

		runtime.editor.addNode({
			nodeId: 'mcp-http-1',
			inputs: mcp.inputs,
			outputs: mcp.outputs,
			bypassPorts: mcp.bypassPorts,
		});

		runtime.runner.start({
			'mcp-http-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: attachRunHostServices(
						{
							projectDir: '/tmp',
							runId: 'test',
							nodeId: 'mcp-http-1',
							params: {},
							uiSchema: mcpHttpNode.uiSchema,
						},
						{ secrets: { API_TOKEN: 'sk-live' } },
					),
				},
			],
		});

		await vi.waitFor(() => {
			expect(connectMock).toHaveBeenCalled();
		});
		expect(connectMock).toHaveBeenCalledWith(
			expect.objectContaining({
				headers: { Authorization: 'Bearer sk-live' },
			}),
		);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('emits port error for invalid headers JSON without connecting', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const mcp = mcpHttpNode.getInstance();
		mcp.inputs.url.connect(of('http://127.0.0.1:9/mcp'));
		mcp.inputs.headers.connect(of('{not-json'));

		runtime.editor.addNode({
			nodeId: 'mcp-http-1',
			inputs: mcp.inputs,
			outputs: mcp.outputs,
			bypassPorts: mcp.bypassPorts,
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'error' in event[3] &&
						event[1] === 'mcp-http-1' &&
						event[2] === 'tools',
				),
			),
		);

		runtime.runner.start({
			'mcp-http-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'mcp-http-1',
						params: {},
						uiSchema: mcpHttpNode.uiSchema,
					},
				},
			],
		});

		const failed = await errorPromise;
		expect(String(failed[3].error)).toMatch(/invalid/i);
		expect(connectMock).not.toHaveBeenCalled();

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('emits port error for missing secret without echoing values', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const mcp = mcpHttpNode.getInstance();
		mcp.inputs.url.connect(of('http://127.0.0.1:9/mcp'));
		mcp.inputs.headers.connect(
			of('{"Authorization":"Bearer {lf_secrets:API_TOKEN}"}'),
		);

		runtime.editor.addNode({
			nodeId: 'mcp-http-1',
			inputs: mcp.inputs,
			outputs: mcp.outputs,
			bypassPorts: mcp.bypassPorts,
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'error' in event[3] &&
						event[1] === 'mcp-http-1' &&
						event[2] === 'tools',
				),
			),
		);

		runtime.runner.start({
			'mcp-http-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: attachRunHostServices(
						{
							projectDir: '/tmp',
							runId: 'test',
							nodeId: 'mcp-http-1',
							params: {},
							uiSchema: mcpHttpNode.uiSchema,
						},
						{ secrets: { OTHER: 'sk-other' } },
					),
				},
			],
		});

		const failed = await errorPromise;
		expect(String(failed[3].error)).toContain('API_TOKEN');
		expect(String(failed[3].error)).not.toContain('sk-other');
		expect(connectMock).not.toHaveBeenCalled();

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
