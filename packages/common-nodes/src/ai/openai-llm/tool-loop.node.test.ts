import { contextSymbol, type ToolHandle } from '@langflower/node-sdk';
import type { CreateChatCompletionStreamArgs } from '../chat-completion-stream.js';
import { RuntimeFacade } from '@langflower/runtime';
import { createProjectHarness } from '@langflower/tools/create-project-harness';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filter, firstValueFrom, of } from 'rxjs';
import { attachRunHostServices } from '../run-host-services.js';
import { stringNode } from '../../primitives/string/node.js';
import { openAiLlmNode } from './node.js';

const handle = (toolId: string, invoke: ToolHandle['invoke']): ToolHandle => ({
	toolId,
	name: toolId,
	description: toolId,
	inputSchema: { type: 'object', properties: {} },
	invoke,
});

describe('common-openai-llm tool loop', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-oai-tools-'));
		await fs.writeFile(path.join(projectDir, 'note.txt'), 'alpha', 'utf8');
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('invokes read then write across multi-step completions', async () => {
		const harness = createProjectHarness({
			projectRoot: projectDir,
			permission: {
				read: { '*': 'allow' },
				write: { '*': 'allow' },
			},
		});
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
								id: 'c1',
								name: 'read',
								arguments: JSON.stringify({ path: 'note.txt' }),
							},
						],
					};
					return;
				}

				if (index === 1) {
					yield {
						kind: 'done' as const,
						text: '',
						tool_calls: [
							{
								id: 'c2',
								name: 'write',
								arguments: JSON.stringify({
									path: 'note.txt',
									content: 'beta',
								}),
							},
						],
					};
					return;
				}

				yield { kind: 'draft' as const, text: 'Done editing.' };
				yield { kind: 'done' as const, text: 'Done editing.' };
			})();
		};

		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const str = stringNode.getInstance();
		str.inputs.value.connect(of('Update the note'));

		runtime.editor.addNode({
			nodeId: 'prompt-1',
			inputs: str.inputs,
			outputs: str.outputs,
			bypassPorts: str.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'llm-1',
			inputs: llm.inputs,
			outputs: llm.outputs,
			bypassPorts: llm.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'prompt-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['userPrompt', 0],
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
						uiSchema: stringNode.uiSchema,
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
							uiSchema: openAiLlmNode.uiSchema,
							toolHandles: ['read', 'write'].map((toolId) =>
								handle(toolId, async (args) => {
									const result = await harness.invoke({
										toolId,
										args,
									});

									if (!result.ok) {
										throw new Error(result.text);
									}

									return result.text;
								}),
							),
						},
						{
							skillMarkdown: '',
							createChatCompletionStream: factory,
							authorize: async () => 'allow' as const,
						},
					),
				},
			],
		});

		const responseEvent = await responsePromise;
		expect(responseEvent).toEqual(expect.arrayContaining(['out', expect.anything(), expect.anything(), expect.anything(), 'Done editing.']));
		expect(captured).toHaveLength(3);
		expect(
			captured[0]?.tools?.some((t) => t.function.name === 'read'),
		).toBe(true);
		// Agent tool loop must not see Review-private control tools.
		expect(
			captured.every(
				(call) =>
					!(call.tools ?? []).some(
						(tool) =>
							tool.function.name === 'accept' ||
							tool.function.name === 'feedback',
					),
			),
		).toBe(true);
		expect(
			await fs.readFile(path.join(projectDir, 'note.txt'), 'utf8'),
		).toBe('beta');

		const toolMessage = captured[2]?.messages.find(
			(message) => message.role === 'tool',
		);
		expect(toolMessage?.content).toMatch(/Wrote|Edited|alpha|beta/i);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
