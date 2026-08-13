import { contextSymbol } from '@langflower/node-sdk';
import type { CreateChatCompletionStreamArgs } from '../chat-completion-stream.js';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { BehaviorSubject, filter, firstValueFrom, of } from 'rxjs';
import { attachRunHostServices } from '../run-host-services.js';
import { mergeNode } from '../../flow/merge/node.js';
import { stringNode } from '../../primitives/string/node.js';
import { openAiLlmNode } from './node.js';

const multiTurnStreamFactory = (
	responses: readonly string[],
	onCall?: (args: CreateChatCompletionStreamArgs) => void,
) => {
	let nextResponseIndex = 0;

	return async (args: CreateChatCompletionStreamArgs) => {
		onCall?.(args);
		const text =
			responses[nextResponseIndex] ??
			responses[responses.length - 1] ??
			'';
		nextResponseIndex += 1;

		return (async function* () {
			yield { kind: 'done' as const, text };
		})();
	};
};

const llmContext = (
	nodeId: string,
	params: Readonly<Record<string, unknown>>,
	createChatCompletionStream: (
		args: CreateChatCompletionStreamArgs,
	) => ReturnType<ReturnType<typeof multiTurnStreamFactory>>,
) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: attachRunHostServices(
			{
				projectDir: '/tmp',
				runId: 'test',
				nodeId,
				params,
				uiSchema: openAiLlmNode.uiSchema,
			},
			{
				skillMarkdown: '',
				createChatCompletionStream,
			},
		),
	},
];

const stringContext = (nodeId: string) => [
	{
		portId: contextSymbol,
		slotIndex: 0,
		value: {
			projectDir: '/tmp',
			runId: 'test',
			nodeId,
			params: {},
			uiSchema: stringNode.uiSchema,
		},
	},
];

const waitLlmResponse = (runtime: RuntimeFacade, nth: number) => {
	let count = 0;

	return firstValueFrom(
		runtime.runner.events$.pipe(
			filter((event) => {
				if (
					event[0] !== 'out' ||
					event[3] !== 'value' ||
					event[1] !== 'llm-1' ||
					event[2] !== 'response'
				) {
					return false;
				}

				count += 1;
				return count === nth;
			}),
		),
	);
};

describe('common-openai-llm adversarial feedback history oracles', () => {
	it('T1: Merge → feedback carries prior assistant + exact notes in messages', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const taskStr = stringNode.getInstance();
		const notesStr = stringNode.getInstance();
		const merge = mergeNode.getInstance();
		const notes$ = new BehaviorSubject('');

		taskStr.inputs.value.connect(of('Defend soft harness'));
		notesStr.inputs.value.connect(notes$);

		for (const [nodeId, instance] of [
			['task-1', taskStr],
			['notes-1', notesStr],
			['merge-1', merge],
			['llm-1', llm],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'task-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'notes-1',
			fromPort: ['value', 0],
			toNodeId: 'merge-1',
			toPort: ['value', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'merge-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['feedback', 0],
		});

		const firstResponse = waitLlmResponse(runtime, 1);
		const secondResponse = waitLlmResponse(runtime, 2);

		runtime.runner.start({
			'task-1': stringContext('task-1'),
			'notes-1': stringContext('notes-1'),
			'merge-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'merge-1',
						params: {},
						uiSchema: mergeNode.uiSchema,
					},
				},
			],
			'llm-1': llmContext(
				'llm-1',
				{ providerId: 'mock', model: 'mock/fast' },
				multiTurnStreamFactory(
					['Claim packet v1', 'Claim packet v2'],
					(args) => captured.push(args),
				),
			),
		});

		await firstResponse;
		expect(captured).toHaveLength(1);
		expect(captured[0]?.messages.map((message) => message.role)).toEqual([
			'system',
			'user',
		]);
		expect(captured[0]?.messages[1]?.content).toBe('Defend soft harness');

		notes$.next('Contradiction: required checks undermine soft autonomy');
		await secondResponse;

		expect(captured).toHaveLength(2);
		expect(captured[1]?.messages.map((message) => message.role)).toEqual([
			'system',
			'user',
			'assistant',
			'user',
		]);
		expect(captured[1]?.messages[1]?.content).toBe('Defend soft harness');
		expect(captured[1]?.messages[2]?.content).toBe('Claim packet v1');
		expect(captured[1]?.messages[3]?.content).toBe(
			'Contradiction: required checks undermine soft autonomy',
		);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('T2: two Merge feedback turns grow history without reset', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const taskStr = stringNode.getInstance();
		const notesStr = stringNode.getInstance();
		const merge = mergeNode.getInstance();
		const notes$ = new BehaviorSubject('');

		taskStr.inputs.value.connect(of('Defend soft harness'));
		notesStr.inputs.value.connect(notes$);

		for (const [nodeId, instance] of [
			['task-1', taskStr],
			['notes-1', notesStr],
			['merge-1', merge],
			['llm-1', llm],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'task-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'notes-1',
			fromPort: ['value', 0],
			toNodeId: 'merge-1',
			toPort: ['value', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'merge-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['feedback', 0],
		});

		const firstResponse = waitLlmResponse(runtime, 1);
		const secondResponse = waitLlmResponse(runtime, 2);
		const thirdResponse = waitLlmResponse(runtime, 3);

		runtime.runner.start({
			'task-1': stringContext('task-1'),
			'notes-1': stringContext('notes-1'),
			'merge-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'merge-1',
						params: {},
						uiSchema: mergeNode.uiSchema,
					},
				},
			],
			'llm-1': llmContext(
				'llm-1',
				{ providerId: 'mock', model: 'mock/fast' },
				multiTurnStreamFactory(
					['Packet A', 'Packet B', 'Packet C'],
					(args) => captured.push(args),
				),
			),
		});

		await firstResponse;
		notes$.next('Notes round 1');
		await secondResponse;
		notes$.next('Notes round 2');
		await thirdResponse;

		expect(captured).toHaveLength(3);
		expect(captured[2]?.messages.map((message) => message.role)).toEqual([
			'system',
			'user',
			'assistant',
			'user',
			'assistant',
			'user',
		]);
		expect(captured[2]?.messages[2]?.content).toBe('Packet A');
		expect(captured[2]?.messages[3]?.content).toBe('Notes round 1');
		expect(captured[2]?.messages[4]?.content).toBe('Packet B');
		expect(captured[2]?.messages[5]?.content).toBe('Notes round 2');

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('T3: feedback-only turn is not a cold start [system, user]', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const taskStr = stringNode.getInstance();
		const notesStr = stringNode.getInstance();
		const notes$ = new BehaviorSubject('');

		taskStr.inputs.value.connect(of('Stable task'));
		notesStr.inputs.value.connect(notes$);

		for (const [nodeId, instance] of [
			['task-1', taskStr],
			['notes-1', notesStr],
			['llm-1', llm],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'task-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'notes-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['feedback', 0],
		});

		const firstResponse = waitLlmResponse(runtime, 1);
		const secondResponse = waitLlmResponse(runtime, 2);

		runtime.runner.start({
			'task-1': stringContext('task-1'),
			'notes-1': stringContext('notes-1'),
			'llm-1': llmContext(
				'llm-1',
				{ providerId: 'mock', model: 'mock/fast' },
				multiTurnStreamFactory(['R0', 'R1'], (args) =>
					captured.push(args),
				),
			),
		});

		await firstResponse;
		notes$.next('Revise please');
		await secondResponse;

		expect(captured[1]?.messages.length).toBeGreaterThan(2);
		expect(
			captured[1]?.messages.some(
				(message) => message.role === 'assistant',
			),
		).toBe(true);
		expect(
			captured[1]?.messages.map((message) => message.role),
		).not.toEqual(['system', 'user']);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
