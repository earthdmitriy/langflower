import { contextSymbol } from '@langflower/node-sdk';
import type { ToolHandle } from '@langflower/node-sdk';
import type { CreateChatCompletionStreamArgs } from '../../features/chat-completion-stream.js';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { filter, firstValueFrom, map } from 'rxjs';
import { attachRunHostServices } from '../../features/run-host-services.js';
import { subAgentNode } from './node.js';

const subAgentContext = (
	nodeId: string,
	params: Record<string, unknown> = {},
) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: attachRunHostServices(
			{
				projectDir: '/tmp',
				runId: 'test',
				nodeId,
				params: {
					name: 'Explorer',
					description: 'researches',
					skillIds: ['explore'],
					providerId: 'mock',
					model: 'mock',
					...params,
				},
				uiSchema: subAgentNode.uiSchema,
			},
			{
				skillMarkdown: '',
				createChatCompletionStream: async (
					_args: CreateChatCompletionStreamArgs,
				) =>
					(async function* () {
						const user = _args.messages.find(
							(message) => message.role === 'user',
						);
						const text =
							typeof user?.content === 'string'
								? `Done: ${user.content}`
								: 'Done';
						yield { kind: 'draft' as const, text };
						yield { kind: 'done' as const, text };
					})(),
			},
		),
	},
];

const waitTools = (
	runtime: RuntimeFacade,
	nodeId: string,
): Promise<readonly ToolHandle[]> =>
	firstValueFrom(
		runtime.runner.events$.pipe(
			filter(
				(event) =>
					event[0] === 'out' &&
					event[3] === 'value' &&
					event[1] === nodeId &&
					event[2] === 'subagent-registration',
			),
			map((event) => event[4] as readonly ToolHandle[]),
		),
	);

describe('common-sub-agent', () => {
	it('exposes agent panel fields plus registration identity', () => {
		const fields = subAgentNode.uiSchema.map((item) => item.field);

		expect(fields).toEqual(
			expect.arrayContaining([
				'name',
				'description',
				'skillIds',
				'includeAgentsMd',
				'providerId',
				'model',
				'contextSize',
				'compactOnError',
				'maxIterations',
			]),
		);
		expect(fields).not.toContain('tokenDelayMs');
	});

	it('announces Inspector skills on the tools handle and invoke runs chat', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const sub = subAgentNode.getInstance();

		runtime.editor.addNode({
			nodeId: 'explorer',
			inputs: sub.inputs,
			outputs: sub.outputs,
			bypassPorts: sub.bypassPorts,
		});

		const toolsPromise = waitTools(runtime, 'explorer');

		runtime.runner.start({
			explorer: subAgentContext('explorer'),
		});

		const tools = await toolsPromise;
		expect(tools).toHaveLength(1);
		const handle = tools[0]!;
		expect(handle.toolId).toBe('Explorer');
		expect(handle.name).toBe('Explorer');
		expect(handle.description).toContain('explore');
		expect(handle.description).toContain('researches');
		const schema = handle.inputSchema as {
			readonly properties?: {
				readonly skillId?: { readonly enum?: readonly string[] };
			};
			readonly required?: readonly string[];
		};
		expect(schema.required).toEqual(['task']);
		expect(schema.properties?.skillId?.enum).toEqual(['explore']);

		const text = await handle.invoke(
			{
				task: 'Research line A\nand keep newlines',
				skillId: 'explore',
			},
			{ projectDir: '/tmp', runId: 'test' },
		);
		expect(text).toContain('Research line A\nand keep newlines');
		expect(text).toContain('[skill:explore]');
	});

	it('omits skillId from schema when Inspector skills are empty', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const sub = subAgentNode.getInstance();

		runtime.editor.addNode({
			nodeId: 'explorer',
			inputs: sub.inputs,
			outputs: sub.outputs,
			bypassPorts: sub.bypassPorts,
		});

		const toolsPromise = waitTools(runtime, 'explorer');
		runtime.runner.start({
			explorer: subAgentContext('explorer', { skillIds: [] }),
		});

		const tools = await toolsPromise;
		const schema = tools[0]!.inputSchema as {
			readonly properties?: { readonly skillId?: unknown };
		};
		expect(schema.properties?.skillId).toBeUndefined();
	});

	it('returns an error string for an unknown skillId', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const sub = subAgentNode.getInstance();

		runtime.editor.addNode({
			nodeId: 'explorer',
			inputs: sub.inputs,
			outputs: sub.outputs,
			bypassPorts: sub.bypassPorts,
		});

		const toolsPromise = waitTools(runtime, 'explorer');
		runtime.runner.start({
			explorer: subAgentContext('explorer'),
		});

		const handle = (await toolsPromise)[0]!;
		const text = await handle.invoke(
			{ task: 'Go', skillId: 'missing' },
			{ projectDir: '/tmp', runId: 'test' },
		);
		expect(text).toContain('missing');
		expect(text.startsWith('Error:')).toBe(true);
	});

	it('returns an error string when invoke exceeds subagentTimeoutMs', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const sub = subAgentNode.getInstance();

		runtime.editor.addNode({
			nodeId: 'explorer',
			inputs: sub.inputs,
			outputs: sub.outputs,
			bypassPorts: sub.bypassPorts,
		});

		const toolsPromise = waitTools(runtime, 'explorer');
		runtime.runner.start({
			explorer: [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: attachRunHostServices(
						{
							projectDir: '/tmp',
							runId: 'test',
							nodeId: 'explorer',
							params: {
								name: 'Explorer',
								description: 'researches',
								skillIds: [],
								providerId: 'mock',
								model: 'mock',
								subagentTimeoutMs: 40,
							},
							uiSchema: subAgentNode.uiSchema,
						},
						{
							skillMarkdown: '',
							createChatCompletionStream: async () =>
								(async function* () {
									await new Promise<void>(() => undefined);
								})(),
						},
					),
				},
			],
		});

		const handle = (await toolsPromise)[0]!;
		const text = await handle.invoke(
			{ task: 'Hang' },
			{ projectDir: '/tmp', runId: 'test' },
		);
		expect(text).toContain('timed out');
		expect(text.startsWith('Error:')).toBe(true);
	});

	it('exposes inventory tools in and specialist registration out without spawn ports', () => {
		const inputIds = subAgentNode.inputsConfigs.map((meta) =>
			String(meta.portId),
		);
		const outputIds = subAgentNode.outputsConfigs.map((meta) =>
			String(meta.portId),
		);

		expect(inputIds).toEqual(
			expect.arrayContaining(['tools', 'systemPrompt', 'steerControl']),
		);
		expect(inputIds).not.toContain('task');
		expect(inputIds).not.toContain('subagentRegistration');
		expect(inputIds).not.toContain('subagentResult');
		expect(outputIds).toEqual(
			expect.arrayContaining([
				'subagent-registration',
				'response',
				'reasoning',
				'draftResponse',
				'toolLog',
			]),
		);
		expect(outputIds).not.toContain('tools');
		expect(outputIds).not.toContain('registration');
		expect(outputIds).not.toContain('result');
		expect(outputIds).not.toContain('subagent');
	});
});
