import type { ToolHandle } from '@langflower/node-sdk';
import { contextSymbol } from '@langflower/node-sdk';
import type { CreateChatCompletionStreamArgs } from '../chat-completion-stream.js';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { BehaviorSubject, filter, firstValueFrom, of } from 'rxjs';
import { PLAN_AGENT_SYSTEM_PROMPT } from '../llm-role-preset.js';
import { attachRunHostServices } from '../run-host-services.js';
import { hitlReviewGateNode } from '../../hitl/review-gate/node.js';
import { memoryToolsNode } from '../../memory/memory-tools/node.js';
import { previewNode } from '../../output/preview/node.js';
import { stringNode } from '../../primitives/string/node.js';
import { fakeLlmNode } from './node.js';

const mockStreamFactory =
	(
		chunks: ReadonlyArray<
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
		readonly toolHandles?: readonly ToolHandle[];
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
				uiSchema: fakeLlmNode.uiSchema,
				...(options?.toolHandles !== undefined
					? { toolHandles: options.toolHandles }
					: {}),
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

const handle = (toolId: string, invoke: ToolHandle['invoke']): ToolHandle => ({
	toolId,
	name: toolId,
	description: toolId,
	inputSchema: { type: 'object', properties: {} },
	invoke,
});

describe('common-fake-llm', () => {
	it('streams reasoning then draftResponse then response', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
		const str = stringNode.getInstance();
		const preview = previewNode.getInstance();

		str.inputs.value.connect(of('Write a haiku'));

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
		runtime.editor.addNode({
			nodeId: 'preview-1',
			inputs: preview.inputs,
			outputs: preview.outputs,
			bypassPorts: preview.bypassPorts,
		});

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
			// Keep the UI default: sentence-sized stream chunks must still
			// reach the final response within Vitest's standard timeout.
			'llm-1': llmContext('llm-1', {}),
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
		expect(ports.filter((p) => p === 'response')).toEqual(['response']);

		const reasoningText = chunks
			.filter((chunk) => chunk.portId === 'reasoning')
			.map((chunk) => String(chunk.value))
			.join('');
		expect(reasoningText).toContain('Write a haiku');
		expect(reasoningText).toContain('Available tools: none');
		expect(reasoningText.length).toBeGreaterThan(500);

		const draftText = chunks
			.filter((chunk) => chunk.portId === 'draftResponse')
			.map((chunk) => String(chunk.value))
			.join('');
		expect(draftText.length).toBeGreaterThan(500);

		expect(previewEvent[0] === 'out' && previewEvent[4]).toContain(
			'Write a haiku',
		);
		expect(previewEvent[0] === 'out' && previewEvent[4]).toMatch(/^Final:/);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('emits response when Review Gate feedback is wired', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
		const prompt = stringNode.getInstance();
		const review = hitlReviewGateNode.getInstance();

		prompt.inputs.value.connect(of('Hello'));

		for (const [nodeId, instance] of [
			['prompt-1', prompt],
			['llm-1', llm],
			['review-1', review],
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
			toNodeId: 'review-1',
			toPort: ['result', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'review-1',
			fromPort: ['feedback', 0],
			toNodeId: 'llm-1',
			toPort: ['feedback', 0],
		});

		const response = firstValueFrom(
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
			'llm-1': llmContext('llm-1', {}),
			'review-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'review-1',
						params: {},
						uiSchema: hitlReviewGateNode.uiSchema,
					},
				},
			],
		});

		await expect(response).resolves.toEqual(
			expect.arrayContaining([
				'out',
				expect.anything(),
				expect.anything(),
				expect.anything(),
				expect.stringMatching(/^Final:/),
			]),
		);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('lists wired tool names in reasoning', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
		const str = stringNode.getInstance();
		const tools = memoryToolsNode.getInstance();

		str.inputs.value.connect(of('Search the repo'));

		for (const [nodeId, instance] of [
			['prompt-1', str],
			['tools-1', tools],
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
			fromNodeId: 'tools-1',
			fromPort: ['tools', 0],
			toNodeId: 'llm-1',
			toPort: ['tools', 0],
		});

		const reasoning: string[] = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] === 'out' &&
				event[3] === 'value' &&
				event[1] === 'llm-1' &&
				event[2] === 'reasoning'
			) {
				reasoning.push(String(event[4]));
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
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'prompt-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'tools-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'tools-1',
						params: {},
						uiSchema: memoryToolsNode.uiSchema,
					},
				},
			],
			'llm-1': llmContext('llm-1', { tokenDelayMs: 0 }),
		});

		await responsePromise;
		sub.unsubscribe();

		const reasoningText = reasoning.join('');
		expect(reasoningText).toContain('get_memory_tree');
		expect(reasoningText).toContain('append_memory_log');

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('includes stubbed skill markdown in reasoning via effective system prompt', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
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

		const reasoning: string[] = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] === 'out' &&
				event[3] === 'value' &&
				event[1] === 'llm-1' &&
				event[2] === 'reasoning'
			) {
				reasoning.push(String(event[4]));
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
					tokenDelayMs: 0,
					rolePreset: 'plan',
					providerId: 'mock',
					model: 'mock/fast',
					skillId: 'plan',
				},
				{ skillMarkdown: '# Plan skill\nBreak work into steps.' },
			),
		});

		await responsePromise;
		sub.unsubscribe();

		const reasoningText = reasoning.join('');
		expect(reasoningText).toContain('preset=plan');
		expect(reasoningText).toContain('provider=mock');
		expect(reasoningText).toContain('model=mock/fast');
		expect(reasoningText).toContain('skill=plan');
		expect(reasoningText).toContain('Plan skill');
		expect(reasoningText).toContain(PLAN_AGENT_SYSTEM_PROMPT.slice(0, 40));

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('does not crash when skillId is empty or skillMarkdown is empty', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
		const str = stringNode.getInstance();

		str.inputs.value.connect(of('No skill attached'));

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
			'llm-1': llmContext('llm-1', {
				tokenDelayMs: 0,
				rolePreset: 'custom',
				skillId: '',
			}),
		});

		await expect(responsePromise).resolves.toBeDefined();

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('keeps role fields independent across two instances', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llmA = fakeLlmNode.getInstance();
		const llmB = fakeLlmNode.getInstance();
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

		const reasoningByNode: Record<string, string[]> = {
			'llm-a': [],
			'llm-b': [],
		};
		const sub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] === 'out' &&
				event[3] === 'value' &&
				event[2] === 'reasoning' &&
				(event[1] === 'llm-a' || event[1] === 'llm-b')
			) {
				reasoningByNode[event[1]].push(String(event[4]));
			}
		});

		const responsesPromise = Promise.all([
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
			'llm-a': llmContext('llm-a', {
				tokenDelayMs: 0,
				rolePreset: 'plan',
				providerId: 'mock',
				model: 'mock/plan',
			}),
			'llm-b': llmContext('llm-b', {
				tokenDelayMs: 0,
				rolePreset: 'coder',
				providerId: 'openai',
				model: 'gpt-4o-mini',
			}),
		});

		await responsesPromise;
		sub.unsubscribe();

		const reasoningA = reasoningByNode['llm-a'].join('');
		const reasoningB = reasoningByNode['llm-b'].join('');

		expect(reasoningA).toContain('preset=plan');
		expect(reasoningA).toContain('model=mock/plan');
		expect(reasoningB).toContain('preset=coder');
		expect(reasoningB).toContain('model=gpt-4o-mini');
		expect(reasoningA).not.toContain('preset=coder');
		expect(reasoningB).not.toContain('preset=plan');

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('exposes shared LLM panel fields on uiSchema', () => {
		const fields = fakeLlmNode.uiSchema.map((item) => item.field);

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
			'tokenDelayMs',
		]);
		expect(fields).not.toContain('contextSize');
		expect(fields).not.toContain('compactOnError');
		expect(
			fakeLlmNode.uiSchema.find((item) => item.field === 'skillId')
				?.optionsSource,
		).toBe('langflower.skills');
		expect(
			fakeLlmNode.uiSchema.find(
				(item) => item.field === 'includeAgentsMd',
			)?.type,
		).toBe('boolean');
		expect(
			fakeLlmNode.uiSchema.find(
				(item) => item.field === 'toolPermissions',
			)?.optionsSource,
		).toBe('node.wiredTools');
		expect(
			fakeLlmNode.uiSchema.find(
				(item) => item.field === 'toolPermissions',
			)?.type,
		).toBe('tool-permission-table');
		expect(
			fakeLlmNode.uiSchema.find((item) => item.field === 'enabledMcpIds')
				?.optionsSource,
		).toBe('langflower.mcpServers');
		expect(
			fakeLlmNode.uiSchema.find((item) => item.field === 'maxIterations'),
		).toMatchObject({
			label: 'Tool-loop max iterations per feedback turn (0 = unlimited)',
			default: 100,
			min: 0,
			max: Number.MAX_SAFE_INTEGER,
			step: 1,
		});
	});

	it('uses server-filtered ToolHandles from execution context', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
		const str = stringNode.getInstance();

		str.inputs.value.connect(of('Search the repo'));

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
		const reasoning: string[] = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] === 'out' &&
				event[3] === 'value' &&
				event[1] === 'llm-1' &&
				event[2] === 'reasoning'
			) {
				reasoning.push(String(event[4]));
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
					tokenDelayMs: 0,
				},
				{
					toolHandles: [handle('get_memory_tree', async () => 'ok')],
				},
			),
		});

		await responsePromise;
		sub.unsubscribe();

		const reasoningText = reasoning.join('');
		expect(reasoningText).toContain('get_memory_tree');
		expect(reasoningText).not.toContain('append_memory_log');

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('lists no tools when execution context has none', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
		const str = stringNode.getInstance();

		str.inputs.value.connect(of('Search'));

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
		const reasoning: string[] = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] === 'out' &&
				event[3] === 'value' &&
				event[1] === 'llm-1' &&
				event[2] === 'reasoning'
			) {
				reasoning.push(String(event[4]));
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
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'prompt-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'llm-1': llmContext('llm-1', {
				tokenDelayMs: 0,
			}),
		});

		await responsePromise;

		expect(reasoning.join('')).toContain('Available tools: none');

		sub.unsubscribe();
		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('appends prior assistant and feedback user on scripted tool-loop turns', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
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
				{ tokenDelayMs: 0 },
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

	it('advances scriptedToolTurns across feedback without resetting the script', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const llm = fakeLlmNode.getInstance();
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
			'llm-1': llmContext('llm-1', {
				tokenDelayMs: 0,
				scriptedToolTurns: [
					{ text: 'First answer' },
					{ text: 'Second answer' },
				],
			}),
		});

		const first = await firstResponse;
		expect(first[4]).toBe('First answer');

		feedback$.next('Make it shorter');
		const second = await secondResponse;
		expect(second[4]).toBe('Second answer');

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
