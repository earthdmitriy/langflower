import { contextSymbol } from '@langflower/node-sdk';
import type { CreateChatCompletionStreamArgs } from '../chat-completion-stream.js';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { BehaviorSubject, filter, firstValueFrom, of } from 'rxjs';
import { PLAN_AGENT_SYSTEM_PROMPT } from '../llm-role-preset.js';
import { attachRunHostServices } from '../run-host-services.js';
import { previewNode } from '../../output/preview/node.js';
import { stringNode } from '../../primitives/string/node.js';
import { openAiLlmNode } from './node.js';

const mockStreamFactory =
	(
		chunks: ReadonlyArray<
			| { readonly kind: 'reasoning'; readonly text: string }
			| { readonly kind: 'draft'; readonly text: string }
			| { readonly kind: 'done'; readonly text: string }
		>,
		onCall?: (args: CreateChatCompletionStreamArgs) => void,
	) =>
	async (args: CreateChatCompletionStreamArgs) => {
		onCall?.(args);

		return (async function* () {
			for (const chunk of chunks) {
				yield chunk;
			}
		})();
	};

const llmContext = (
	nodeId: string,
	params: Readonly<Record<string, unknown>>,
	options?: {
		readonly skillMarkdown?: string;
		readonly createChatCompletionStream?: ReturnType<
			typeof mockStreamFactory
		>;
	},
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
				skillMarkdown: options?.skillMarkdown ?? '',
				...(options?.createChatCompletionStream !== undefined
					? {
							createChatCompletionStream:
								options.createChatCompletionStream,
						}
					: {}),
			},
		),
	},
];

describe('common-openai-llm', () => {
	it('streams API reasoning then draftResponse then response from mocked factory', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const str = stringNode.getInstance();
		const preview = previewNode.getInstance();

		str.inputs.value.connect(of('Write a haiku'));

		for (const [nodeId, instance] of [
			['prompt-1', str],
			['llm-1', llm],
			['preview-1', preview],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'prompt-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'llm-1',
			fromPort: ['response', 0],
			toNodeId: 'preview-1',
			toPort: ['text', 0],
		});

		const chunks: Array<{ portId: string; value: unknown }> = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] === 'out' &&
				event[3] === 'value' &&
				event[1] === 'llm-1'
			) {
				chunks.push({ portId: event[2], value: event[4] });
			}
		});

		const previewPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'value' &&
						event[1] === 'preview-1' &&
						event[2] === 'text',
				),
			),
		);

		runtime.runner.start({
			'prompt-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'prompt-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'llm-1': llmContext(
				'llm-1',
				{
					providerId: 'openai',
					model: 'gpt-4o-mini',
				},
				{
					createChatCompletionStream: mockStreamFactory(
						[
							{ kind: 'reasoning', text: 'Plan a ' },
							{ kind: 'reasoning', text: 'haiku' },
							{ kind: 'draft', text: 'Cherry ' },
							{ kind: 'draft', text: 'blossoms fall' },
							{ kind: 'done', text: 'Cherry blossoms fall' },
						],
						(args) => captured.push(args),
					),
				},
			),
			'preview-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'preview-1',
						params: {},
						uiSchema: previewNode.uiSchema,
					},
				},
			],
		});

		const previewEvent = await previewPromise;
		sub.unsubscribe();

		const ports = chunks.map((chunk) => chunk.portId);
		const firstDraft = ports.indexOf('draftResponse');
		const firstResponse = ports.indexOf('response');

		expect(firstDraft).toBeGreaterThan(0);
		expect(firstResponse).toBeGreaterThan(firstDraft);
		expect(ports.slice(0, firstDraft).every((p) => p === 'reasoning')).toBe(
			true,
		);
		expect(
			ports
				.slice(firstDraft, firstResponse)
				.every((p) => p === 'draftResponse'),
		).toBe(true);

		const reasoningText = chunks
			.filter((chunk) => chunk.portId === 'reasoning')
			.map((chunk) => String(chunk.value))
			.join('');
		expect(reasoningText).toBe('Plan a haiku');

		const draftText = chunks
			.filter((chunk) => chunk.portId === 'draftResponse')
			.map((chunk) => String(chunk.value))
			.join('');
		expect(draftText).toBe('Cherry blossoms fall');
		expect(previewEvent[0] === 'out' && previewEvent[4]).toBe(
			'Cherry blossoms fall',
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.providerId).toBe('openai');
		expect(captured[0]?.model).toBe('gpt-4o-mini');
		expect(JSON.stringify(captured)).not.toMatch(/sk-|apiKey/);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('includes skill markdown in factory system message when skillId set', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const str = stringNode.getInstance();

		str.inputs.value.connect(of('Plan the feature'));

		for (const [nodeId, instance] of [
			['prompt-1', str],
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
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'prompt-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'llm-1': llmContext(
				'llm-1',
				{
					rolePreset: 'plan',
					providerId: 'mock',
					model: 'mock/fast',
					skillId: 'plan',
				},
				{
					skillMarkdown: '# Plan skill\nBreak work into steps.',
					createChatCompletionStream: mockStreamFactory(
						[{ kind: 'done', text: 'ok' }],
						(args) => captured.push(args),
					),
				},
			),
		});

		await responsePromise;

		const systemMessage = captured
			.at(-1)
			?.messages.find((message) => message.role === 'system')?.content;

		expect(systemMessage).toContain('Plan skill');
		expect(systemMessage).toContain(PLAN_AGENT_SYSTEM_PROMPT.slice(0, 40));

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('fails safely when provider or model is missing', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const str = stringNode.getInstance();

		str.inputs.value.connect(of('Hello'));

		for (const [nodeId, instance] of [
			['prompt-1', str],
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
			fromNodeId: 'prompt-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['userPrompt', 0],
		});

		const failedPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						event[3] === 'error' &&
						event[1] === 'llm-1',
				),
			),
		);

		runtime.runner.start({
			'prompt-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'prompt-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'llm-1': llmContext(
				'llm-1',
				{ providerId: '', model: '' },
				{
					createChatCompletionStream: mockStreamFactory([
						{ kind: 'done', text: 'never' },
					]),
				},
			),
		});

		const failed = await failedPromise;
		expect(failed[0]).toBe('out');
		if (failed[0] === 'out' && failed[3] === 'error') {
			expect(String(failed[4])).toMatch(/Provider is required/);
			expect(String(failed[4])).not.toMatch(/sk-|apiKey/);
		}

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('keeps role fields independent across two instances', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llmA = openAiLlmNode.getInstance();
		const llmB = openAiLlmNode.getInstance();
		const strA = stringNode.getInstance();
		const strB = stringNode.getInstance();

		strA.inputs.value.connect(of('Plan task'));
		strB.inputs.value.connect(of('Code task'));

		for (const [nodeId, instance] of [
			['prompt-a', strA],
			['prompt-b', strB],
			['llm-a', llmA],
			['llm-b', llmB],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		runtime.editor.addEdge({
			fromNodeId: 'prompt-a',
			fromPort: ['value', 0],
			toNodeId: 'llm-a',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'prompt-b',
			fromPort: ['value', 0],
			toNodeId: 'llm-b',
			toPort: ['userPrompt', 0],
		});

		const factory = mockStreamFactory(
			[{ kind: 'done', text: 'ok' }],
			(args) => captured.push(args),
		);

		runtime.runner.start({
			'prompt-a': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'prompt-a',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'prompt-b': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'prompt-b',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'llm-a': llmContext(
				'llm-a',
				{
					rolePreset: 'plan',
					providerId: 'mock',
					model: 'mock/plan',
				},
				{ createChatCompletionStream: factory },
			),
			'llm-b': llmContext(
				'llm-b',
				{
					rolePreset: 'coder',
					providerId: 'openai',
					model: 'gpt-4o-mini',
				},
				{ createChatCompletionStream: factory },
			),
		});

		await Promise.all([
			firstValueFrom(
				runtime.runner.events$.pipe(
					filter(
						(event) =>
							event[0] === 'out' &&
							event[3] === 'value' &&
							event[1] === 'llm-a' &&
							event[2] === 'response',
					),
				),
			),
			firstValueFrom(
				runtime.runner.events$.pipe(
					filter(
						(event) =>
							event[0] === 'out' &&
							event[3] === 'value' &&
							event[1] === 'llm-b' &&
							event[2] === 'response',
					),
				),
			),
		]);

		expect(captured.map((call) => call.model)).toEqual([
			'mock/plan',
			'gpt-4o-mini',
		]);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('exposes shared LLM panel fields without tokenDelayMs', () => {
		const fields = openAiLlmNode.uiSchema.map((item) => item.field);

		expect(fields).toEqual([
			'rolePreset',
			'providerId',
			'model',
			'skillId',
			'includeAgentsMd',
			'toolPermissions',
			'enabledMcpIds',
			'maxIterations',
			'maxFeedbackTurns',
			'contextSize',
			'compactOnError',
			'streamIdleTimeoutMs',
			'toolTimeoutMs',
			'subagentTimeoutMs',
			'maxTransientRetries',
			'autokickOnIdle',
			'deadLoopEnabled',
			'maxAutokickAttempts',
			'autokickBackoffMs',
			'autokickMaxBackoffMs',
			'autokickUserMessage',
			'autokickPenaltyFrequency',
			'autokickPenaltyPresence',
			'deadLoopMaxWindowTokens',
			'deadLoopConsecutiveThreshold',
			'deadLoopMinRepetitions',
			'deadLoopMinPatternTokens',
		]);
		expect(fields).not.toContain('tokenDelayMs');
		const maxIterations = openAiLlmNode.uiSchema.find(
			(item) => item.field === 'maxIterations',
		);
		expect(maxIterations).toMatchObject({
			label: 'Tool-loop max iterations per feedback turn (0 = unlimited)',
			default: 100,
			min: 0,
			max: Number.MAX_SAFE_INTEGER,
			step: 1,
		});
	});

	it('accepts two feedback edges on distinct merge slots', () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const prompt = stringNode.getInstance();
		const feedbackA = stringNode.getInstance();
		const feedbackB = stringNode.getInstance();

		prompt.inputs.value.connect(of('topic'));
		feedbackA.inputs.value.connect(of('critique notes'));
		feedbackB.inputs.value.connect(of('review notes'));

		for (const [nodeId, instance] of [
			['prompt-1', prompt],
			['feedback-a', feedbackA],
			['feedback-b', feedbackB],
			['llm-1', llm],
		] as const) {
			runtime.editor.addNode({
				nodeId,
				inputs: instance.inputs,
				outputs: instance.outputs,
				bypassPorts: instance.bypassPorts,
			});
		}

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'prompt-1',
				fromPort: ['value', 0],
				toNodeId: 'llm-1',
				toPort: ['userPrompt', 0],
			}),
		).not.toBe(false);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'feedback-a',
				fromPort: ['value', 0],
				toNodeId: 'llm-1',
				toPort: ['feedback', 0],
			}),
		).not.toBe(false);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'feedback-b',
				fromPort: ['value', 0],
				toNodeId: 'llm-1',
				toPort: ['feedback', 1],
			}),
		).not.toBe(false);

		const feedbackMeta = llm.inputs.feedback?.meta;
		expect(feedbackMeta?.mode).toBe('merge');
	});

	it('appends prior assistant and feedback user on the second turn', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const str = stringNode.getInstance();
		const feedbackStr = stringNode.getInstance();
		const feedback$ = new BehaviorSubject('');

		str.inputs.value.connect(of('Write a haiku'));
		feedbackStr.inputs.value.connect(feedback$);

		for (const [nodeId, instance] of [
			['prompt-1', str],
			['feedback-1', feedbackStr],
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
			fromNodeId: 'prompt-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['userPrompt', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'feedback-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['feedback', 0],
		});

		const waitResponse = (nth: number) => {
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

		const firstResponse = waitResponse(1);
		const secondResponse = waitResponse(2);

		runtime.runner.start({
			'prompt-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'prompt-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'feedback-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'feedback-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'llm-1': llmContext(
				'llm-1',
				{ providerId: 'mock', model: 'mock/fast' },
				{
					createChatCompletionStream: mockStreamFactory(
						[{ kind: 'done', text: 'First answer' }],
						(args) => captured.push(args),
					),
				},
			),
		});

		await firstResponse;
		expect(captured).toHaveLength(1);
		expect(captured[0]?.messages.map((message) => message.role)).toEqual([
			'system',
			'user',
		]);
		expect(captured[0]?.messages[1]?.content).toBe('Write a haiku');

		feedback$.next('Make it shorter');
		await secondResponse;

		expect(captured).toHaveLength(2);
		expect(captured[1]?.messages.map((message) => message.role)).toEqual([
			'system',
			'user',
			'assistant',
			'user',
		]);
		expect(captured[1]?.messages[2]?.content).toBe('First answer');
		expect(captured[1]?.messages[3]?.content).toBe('Make it shorter');

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('recreates session history when userPrompt changes', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llm = openAiLlmNode.getInstance();
		const str = stringNode.getInstance();
		const prompt$ = new BehaviorSubject('First prompt');

		str.inputs.value.connect(prompt$);

		for (const [nodeId, instance] of [
			['prompt-1', str],
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
			fromNodeId: 'prompt-1',
			fromPort: ['value', 0],
			toNodeId: 'llm-1',
			toPort: ['userPrompt', 0],
		});

		const waitResponse = (nth: number) => {
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

		const firstResponse = waitResponse(1);
		const secondResponse = waitResponse(2);

		runtime.runner.start({
			'prompt-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'prompt-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'llm-1': llmContext(
				'llm-1',
				{ providerId: 'mock', model: 'mock/fast' },
				{
					createChatCompletionStream: mockStreamFactory(
						[{ kind: 'done', text: 'Session A' }],
						(args) => captured.push(args),
					),
				},
			),
		});

		await firstResponse;
		expect(captured[0]?.messages[1]?.content).toBe('First prompt');

		prompt$.next('Second prompt');
		await secondResponse;

		expect(captured).toHaveLength(2);
		expect(captured[1]?.messages.map((message) => message.role)).toEqual([
			'system',
			'user',
		]);
		expect(captured[1]?.messages[1]?.content).toBe('Second prompt');
		expect(
			captured[1]?.messages.some(
				(message) => message.content === 'Session A',
			),
		).toBe(false);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
