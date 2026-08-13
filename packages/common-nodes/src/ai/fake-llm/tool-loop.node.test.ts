import { contextSymbol, type ToolHandle } from '@langflower/node-sdk';
import { RuntimeFacade } from '@langflower/runtime';
import { createProjectHarness } from '@langflower/tools/create-project-harness';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filter, firstValueFrom, of } from 'rxjs';
import { attachRunHostServices } from '../run-host-services.js';
import { stringNode } from '../../primitives/string/node.js';
import { fakeLlmNode } from './node.js';

const handle = (toolId: string, invoke: ToolHandle['invoke']): ToolHandle => ({
	toolId,
	name: toolId,
	description: toolId,
	inputSchema: { type: 'object', properties: {} },
	invoke,
});

describe('common-fake-llm tool loop', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-fake-tools-'));
		await fs.writeFile(
			path.join(projectDir, 'secret.txt'),
			'payload-42',
			'utf8',
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('scripted read tool call → file content → final response', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
		const str = stringNode.getInstance();
		const harness = createProjectHarness({ projectRoot: projectDir });

		str.inputs.value.connect(of('What is in secret.txt?'));

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

		const toolLogs: string[] = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] === 'out' &&
				event[3] === 'value' &&
				event[1] === 'llm-1' &&
				event[2] === 'toolLog'
			) {
				toolLogs.push(String(event[4]));
			}
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
								tokenDelayMs: 0,
								scriptedToolTurns: [
									{
										toolCalls: [
											{
												name: 'read',
												arguments: {
													path: 'secret.txt',
												},
											},
										],
									},
									{
										text: 'The file contains payload-42',
									},
								],
							},
							uiSchema: fakeLlmNode.uiSchema,
							toolHandles: [
								handle('read', async (args) => {
									const result = await harness.invoke({
										toolId: 'read',
										args,
									});

									if (!result.ok) {
										throw new Error(result.text);
									}

									return result.text;
								}),
							],
						},
						{
							skillMarkdown: '',
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
				'The file contains payload-42',
			]),
		);
		expect(toolLogs.some((line) => line.includes('→ read'))).toBe(true);
		expect(toolLogs.some((line) => line.includes('payload-42'))).toBe(true);

		sub.unsubscribe();
		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
