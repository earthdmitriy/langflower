import { contextSymbol } from '@langflower/node-sdk';
import type { CreateChatCompletionStreamArgs } from '../../features/chat-completion-stream.js';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { filter, firstValueFrom, map, of } from 'rxjs';
import type { SubAgentResultPayload } from '../../features/sub-agent-protocol.js';
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

	it('registers, filters spawn by nodeId, runs in-node chat, returns result', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const sub = subAgentNode.getInstance();

		runtime.editor.addNode({
			nodeId: 'explorer',
			inputs: sub.inputs,
			outputs: sub.outputs,
			bypassPorts: sub.bypassPorts,
		});

		const registrationPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'value' &&
						event[1] === 'explorer' &&
						event[2] === 'registration',
				),
				map((event) => event[4]),
			),
		);

		const resultPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'value' &&
						event[1] === 'explorer' &&
						event[2] === 'result',
				),
				map((event) => event[4] as SubAgentResultPayload),
			),
		);

		sub.inputs.task.connect(
			of({
				callId: 'c1',
				nodeId: 'explorer',
				skillId: 'explore',
				task: 'Research line A\nand keep newlines',
			}),
		);

		runtime.runner.start({
			explorer: subAgentContext('explorer'),
		});

		const registration = await registrationPromise;
		expect(registration).toMatchObject({
			targetNodeId: 'explorer',
			name: 'Explorer',
			skills: [{ skillId: 'explore', description: 'explore' }],
		});

		const result = await resultPromise;
		expect(result.callId).toBe('c1');
		expect(result.result).toContain('Research line A\nand keep newlines');
	});

	it('ignores spawn addressed to another nodeId', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const sub = subAgentNode.getInstance();

		runtime.editor.addNode({
			nodeId: 'explorer',
			inputs: sub.inputs,
			outputs: sub.outputs,
			bypassPorts: sub.bypassPorts,
		});

		let resultCount = 0;
		const subResult = runtime.runner.events$
			.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'value' &&
						event[1] === 'explorer' &&
						event[2] === 'result',
				),
			)
			.subscribe(() => {
				resultCount += 1;
			});

		sub.inputs.task.connect(
			of({
				callId: 'c-other',
				nodeId: 'someone-else',
				skillId: 'explore',
				task: 'Should be ignored',
			}),
		);

		runtime.runner.start({
			explorer: subAgentContext('explorer'),
		});

		await new Promise((resolve) => setTimeout(resolve, 50));
		subResult.unsubscribe();
		expect(resultCount).toBe(0);
	});

	it('exposes inventory inputs and agent outs without body bridge ports', () => {
		const inputIds = subAgentNode.inputsConfigs.map((meta) =>
			String(meta.portId),
		);
		const outputIds = subAgentNode.outputsConfigs.map((meta) =>
			String(meta.portId),
		);

		expect(inputIds).toEqual(
			expect.arrayContaining([
				'tools',
				'mcp',
				'subagentRegistration',
				'subagentResult',
				'task',
				'systemPrompt',
			]),
		);
		expect(inputIds).not.toContain('bodyResult');
		expect(outputIds).toEqual(
			expect.arrayContaining([
				'registration',
				'result',
				'response',
				'reasoning',
				'draftResponse',
				'toolLog',
				'subagent',
			]),
		);
		expect(outputIds).not.toContain('item');
	});
});
