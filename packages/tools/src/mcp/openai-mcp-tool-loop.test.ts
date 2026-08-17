/**
 * Fixture MCP tool invoked from openai-llm via wired ToolHandle[].
 */
import { getCommonReactiveNode } from '@langflower/common-nodes';
import { attachRunHostServices } from '@langflower/common-nodes/ai/run-host-services';
import { contextSymbol } from '@langflower/node-sdk';
import type { CreateChatCompletionStreamArgs } from '@langflower/common-nodes/ai/openai/create-chat-completion-stream';
import { RuntimeFacade, type NodeId } from '@langflower/runtime';
import { encodeMcpToolId } from '@langflower/tools/mcp-tool-id';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filter, firstValueFrom, of } from 'rxjs';

const echoServerPath = path.resolve(
	fileURLToPath(new URL('.', import.meta.url)),
	'../../../../tests/fixtures/mcp/echo-server.mjs',
);

describe('openai-llm + fixture MCP transport', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-oai-mcp-'));
	});

	afterEach(async () => {
		await fs
			.rm(projectDir, { recursive: true, force: true })
			.catch(() => undefined);
	});

	it('invokes echo-server.mjs tool through openai-llm internal loop', async () => {
		const openAiLlmNode = getCommonReactiveNode('common-openai-llm');
		const stringNode = getCommonReactiveNode('common-string');
		const mcpStdioNode = getCommonReactiveNode('common-mcp-stdio');

		expect(openAiLlmNode).toBeDefined();
		expect(stringNode).toBeDefined();
		expect(mcpStdioNode).toBeDefined();

		const mcpToolId = encodeMcpToolId('langflower-echo-mcp', 'echo');

		const captured: CreateChatCompletionStreamArgs[] = [];
		let callIndex = 0;

		const factory = async (args: CreateChatCompletionStreamArgs) => {
			captured.push(args);
			const index = callIndex;
			callIndex += 1;

			return (async function* () {
				if (index === 0) {
					yield {
						kind: 'done' as const,
						text: '',
						tool_calls: [
							{
								id: 'm1',
								name: mcpToolId,
								arguments: JSON.stringify({
									message: 'fixture-ping',
								}),
							},
						],
					};
					return;
				}

				yield { kind: 'draft' as const, text: 'Got echo.' };
				yield { kind: 'done' as const, text: 'Got echo.' };
			})();
		};

		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode!.getInstance();
		const str = stringNode!.getInstance();
		const mcp = mcpStdioNode!.getInstance();
		str.inputs.value.connect(of('Call the echo MCP tool'));
		mcp.inputs.command.connect(
			of(
				`${JSON.stringify(process.execPath)} ${JSON.stringify(echoServerPath)}`,
			),
		);

		runtime.editor.addNode({
			nodeId: 'prompt-1' as NodeId,
			inputs: str.inputs,
			outputs: str.outputs,
			bypassPorts: str.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'mcp-1' as NodeId,
			inputs: mcp.inputs,
			outputs: mcp.outputs,
			bypassPorts: mcp.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'llm-1' as NodeId,
			inputs: llm.inputs,
			outputs: llm.outputs,
			bypassPorts: llm.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'prompt-1' as NodeId,
			fromPort: ['value', 0],
			toNodeId: 'llm-1' as NodeId,
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'mcp-1' as NodeId,
			fromPort: ['tools', 0],
			toNodeId: 'llm-1' as NodeId,
			toPort: ['tools', 0],
		});

		const responsePromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'value' &&
						event[1] === 'llm-1' &&
						event[2] === 'response',
				),
			),
		);

		runtime.runner.start({
			'prompt-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir,
						runId: 'test',
						nodeId: 'prompt-1',
						params: {},
						uiSchema: stringNode!.uiSchema,
					},
				},
			],
			'mcp-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir,
						runId: 'test',
						nodeId: 'mcp-1',
						params: {},
						uiSchema: mcpStdioNode!.uiSchema,
					},
				},
			],
			'llm-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: attachRunHostServices(
						{
							projectDir,
							runId: 'test',
							nodeId: 'llm-1',
							params: {
								providerId: 'mock',
								model: 'mock/fast',
								maxIterations: 8,
							},
							uiSchema: openAiLlmNode!.uiSchema,
						},
						{
							createChatCompletionStream: factory,
							authorize: async () => 'allow' as const,
						},
					),
				},
			],
		});

		const responseEvent = await responsePromise;
		expect(responseEvent).toEqual(
			expect.arrayContaining([
				'out',
				expect.anything(),
				expect.anything(),
				expect.anything(),
				'Got echo.',
			]),
		);
		expect(
			captured[0]?.tools?.some((t) => t.function.name === mcpToolId),
		).toBe(true);
		const toolMessage = captured[1]?.messages.find(
			(message) => message.role === 'tool',
		);
		expect(toolMessage?.content).toMatch(/fixture-ping/i);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	}, 20_000);
});
