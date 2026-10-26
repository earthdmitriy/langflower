import { contextSymbol } from '@langflower/node-sdk';
import { statefulObservable } from '@rx-evo/stateful-observable';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { filter, firstValueFrom, of } from 'rxjs';
import type {
	ChatCompletionUserTurn,
	CreateChatCompletionStreamArgs,
} from '../../features/chat-completion-stream.js';
import { attachRunHostServices } from '../../../run-host/run-host-services.js';
import { testLlmCapFields } from '../../features/test-llm-caps.js';
import { fakeLlmNode } from '../fake-llm/node.js';
import { openAiLlmNode } from './node.js';

const png = {
	fileId: 'file-1',
	name: '1.png',
	mimeType: 'image/png',
	size: 12,
} as const;

const questionTurn = {
	text: 'what is this?',
	files: [png],
} satisfies ChatCompletionUserTurn;

const mockStreamFactory =
	(onCall?: (args: CreateChatCompletionStreamArgs) => void) =>
	async (args: CreateChatCompletionStreamArgs) => {
		onCall?.(args);
		return (async function* () {
			yield { kind: 'done' as const, text: 'seen' };
		})();
	};

const llmContext = (
	nodeId: string,
	factory: ReturnType<typeof mockStreamFactory>,
) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: attachRunHostServices(
			{
				projectDir: '/tmp',
				runId: 'test',
				nodeId,
				params: { providerId: 'openai', model: 'gpt-4o-mini' },
				uiSchema: openAiLlmNode.uiSchema,
				...testLlmCapFields({ chat: factory }),
			},
			{
				skillMarkdown: '',
				createChatCompletionStream: factory,
			},
		),
	},
];

const userTurnSource = (turn: ChatCompletionUserTurn) => {
	const message = statefulObservable({
		loader: () => of(turn),
		meta: {
			dir: 'out' as const,
			portId: 'message',
			wireType: 'user-turn',
		},
	});

	return {
		inputs: {},
		outputs: { message },
		bypassPorts: {},
	};
};

const portMeta = (
	node: typeof openAiLlmNode | typeof fakeLlmNode,
	portId: string,
) => node.inputsConfigs.find((entry) => entry.portId === portId);

describe('user-turn ports', () => {
	it('declares one union userPrompt and feedback and no twin ports', () => {
		for (const node of [openAiLlmNode, fakeLlmNode]) {
			expect(portMeta(node, 'userPrompt')?.wireType).toEqual([
				'string',
				'user-turn',
			]);
			expect(portMeta(node, 'feedback')?.wireType).toEqual([
				'string',
				'user-turn',
			]);
			expect(portMeta(node, 'feedback')?.mode).toBe('merge');
			expect(portMeta(node, 'userTurn')).toBeUndefined();
			expect(portMeta(node, 'turnFeedback')).toBeUndefined();
		}
	});

	it('accepts a string wire and a user-turn wire on userPrompt', () => {
		for (const node of [openAiLlmNode, fakeLlmNode]) {
			for (const wire of ['string', 'user-turn']) {
				const runtime = new RuntimeFacade({ log: false });
				const llm = node.getInstance();
				const source = statefulObservable({
					loader: () => of('x'),
					meta: {
						dir: 'out' as const,
						portId: 'value',
						wireType: wire,
					},
				});

				runtime.editor.addNode({
					nodeId: 'src',
					inputs: {},
					outputs: { value: source },
					bypassPorts: {},
				});
				runtime.editor.addNode({
					nodeId: 'llm-1',
					inputs: llm.inputs,
					outputs: llm.outputs,
					bypassPorts: llm.bypassPorts,
				});

				expect(
					runtime.editor.addEdge({
						fromNodeId: 'src',
						fromPort: ['value', 0],
						toNodeId: 'llm-1',
						toPort: ['userPrompt', 0],
					}),
				).not.toBe(false);
			}
		}
	});

	it('stores a user turn with fileId refs and does not call the provider for blank text', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const turn = userTurnSource(questionTurn);
		const factory = mockStreamFactory((args) => captured.push(args));

		runtime.editor.addNode({
			nodeId: 'turn-1',
			...turn,
		});
		runtime.editor.addNode({
			nodeId: 'llm-1',
			inputs: llm.inputs,
			outputs: llm.outputs,
			bypassPorts: llm.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'turn-1',
			fromPort: ['message', 0],
			toNodeId: 'llm-1',
			toPort: ['userPrompt', 0],
		});

		const responsePromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[1] === 'llm-1' &&
						event[2] === 'response' &&
						'value' in event[3],
				),
			),
		);

		const runId = runtime.runner.start({
			'llm-1': llmContext('llm-1', factory),
		});

		expect(runId).not.toBe(false);
		await responsePromise;

		expect(captured).toHaveLength(1);
		expect(captured[0]?.messages[1]).toEqual({
			role: 'user',
			content: questionTurn,
		});
		expect(JSON.stringify(captured)).toContain('file-1');
		expect(JSON.stringify(captured)).not.toContain('base64');

		runtime.runner.interrupt('cancel');
	});

	it('does not start a turn for empty or whitespace text when files are present', async () => {
		for (const text of ['', ' \n\t ']) {
			const captured: CreateChatCompletionStreamArgs[] = [];
			const runtime = new RuntimeFacade({ log: false });
			const llm = openAiLlmNode.getInstance();
			const turn = userTurnSource({
				text,
				files: [png],
			});
			const factory = mockStreamFactory((args) => captured.push(args));

			runtime.editor.addNode({
				nodeId: 'turn-1',
				...turn,
			});
			runtime.editor.addNode({
				nodeId: 'llm-1',
				inputs: llm.inputs,
				outputs: llm.outputs,
				bypassPorts: llm.bypassPorts,
			});
			runtime.editor.addEdge({
				fromNodeId: 'turn-1',
				fromPort: ['message', 0],
				toNodeId: 'llm-1',
				toPort: ['userPrompt', 0],
			});

			const runId = runtime.runner.start({
				'llm-1': llmContext('llm-1', factory),
			});

			expect(runId).not.toBe(false);
			await new Promise((resolve) => setTimeout(resolve, 30));
			expect(captured).toEqual([]);
			runtime.runner.interrupt('cancel');
		}
	});
});
