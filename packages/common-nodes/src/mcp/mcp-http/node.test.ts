import { contextSymbol } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catchError, EMPTY, filter, firstValueFrom, of, timeout } from 'rxjs';
import { mcpHttpNode } from './node.js';

vi.mock('@langflower/tools/mcp-http-client', () => ({
	connectMcpHttpWithOptionalLaunch: vi.fn(),
}));

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
						event.kind === 'output-emitted' &&
						event.state === 'error' &&
						event.nodeId === 'mcp-http-1' &&
						event.portId === 'mcpTransport',
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
		expect(String(failed.value)).toMatch(/MCP http connect failed/);
		expect(String(failed.value)).toContain('mcp-http-1');
		expect(String(failed.value)).toContain('fetch failed');
		expect(buildMock).not.toHaveBeenCalled();

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
						event.kind === 'output-emitted' &&
						event.state === 'error' &&
						event.nodeId === 'mcp-http-1',
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
});
