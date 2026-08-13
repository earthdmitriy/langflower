import { contextSymbol } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filter, firstValueFrom, of, timeout, catchError, EMPTY } from 'rxjs';
import { mcpStdioNode } from './node.js';

vi.mock('@langflower/tools/mcp-stdio-client', () => ({
	connectMcpStdioFromCli: vi.fn(),
}));

vi.mock('@langflower/tools/build-mcp-handle', () => ({
	buildMcpHandle: vi.fn(),
}));

import { connectMcpStdioFromCli } from '@langflower/tools/mcp-stdio-client';
import { buildMcpHandle } from '@langflower/tools/build-mcp-handle';

const connectMock = vi.mocked(connectMcpStdioFromCli);
const buildMock = vi.mocked(buildMcpHandle);

describe('common-mcp-stdio connect errors (S5)', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('emits output-emitted error when connect fails', async () => {
		connectMock.mockRejectedValue(new Error('spawn ENOENT'));

		const runtime = new RuntimeFacade({ log: false });
		const mcp = mcpStdioNode.getInstance();
		mcp.inputs.command.connect(of('npx missing-server'));

		runtime.editor.addNode({
			nodeId: 'mcp-1',
			inputs: mcp.inputs,
			outputs: mcp.outputs,
			bypassPorts: mcp.bypassPorts,
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'error' &&
						event[1] === 'mcp-1' &&
						event[2] === 'mcpTransport',
				),
			),
		);

		runtime.runner.start({
			'mcp-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'mcp-1',
						params: {},
						uiSchema: mcpStdioNode.uiSchema,
					},
				},
			],
		});

		const failed = await errorPromise;
		expect(String(failed[4])).toMatch(/MCP stdio connect failed/);
		expect(String(failed[4])).toContain('mcp-1');
		expect(String(failed[4])).toContain('spawn ENOENT');
		expect(buildMock).not.toHaveBeenCalled();

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('does not emit port error when command is empty', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const mcp = mcpStdioNode.getInstance();
		mcp.inputs.command.connect(of(''));

		runtime.editor.addNode({
			nodeId: 'mcp-1',
			inputs: mcp.inputs,
			outputs: mcp.outputs,
			bypassPorts: mcp.bypassPorts,
		});

		const sawError = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'error' &&
						event[1] === 'mcp-1',
				),
				timeout({ first: 200 }),
				catchError(() => EMPTY),
			),
		).then(
			(event) => event,
			() => undefined,
		);

		runtime.runner.start({
			'mcp-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'mcp-1',
						params: {},
						uiSchema: mcpStdioNode.uiSchema,
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
