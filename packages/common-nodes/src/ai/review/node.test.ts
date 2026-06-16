import { contextSymbol } from '@langflower/node-sdk';
import type { CreateChatCompletionStreamArgs } from '../chat-completion-stream.js';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { BehaviorSubject, filter, firstValueFrom, of } from 'rxjs';
import { stringNode } from '../../primitives/string/node.js';
import { REVIEW_TOOL_REMINDER } from '../path-choice/control-tools.js';
import { attachRunHostServices } from '../run-host-services.js';
import { reviewNode } from './node.js';

const reviewNodeContext = (
	nodeId: string,
	params: Readonly<Record<string, unknown>>,
	factory: (args: CreateChatCompletionStreamArgs) => Promise<
		AsyncIterable<
			| {
					readonly kind: 'done';
					readonly text: string;
					readonly tool_calls?: unknown;
			  }
			| { readonly kind: 'draft'; readonly text: string }
		>
	>,
	hostExtras: { readonly agentsMarkdown?: string } = {},
) =>
	attachRunHostServices(
		{
			projectDir: '/tmp',
			runId: 'test',
			nodeId,
			params,
			uiSchema: reviewNode.uiSchema,
		},
		{
			skillMarkdown: '',
			createChatCompletionStream: factory,
			...(hostExtras.agentsMarkdown !== undefined
				? { agentsMarkdown: hostExtras.agentsMarkdown }
				: {}),
		},
	);

describe('common-review', () => {
	it('shares llmPanelUiSchema floor with path-choice maxIterations', () => {
		expect(reviewNode.type).toBe('common-review');
		const fields = reviewNode.uiSchema.map((item) => item.field);
		expect(fields).toEqual(
			expect.arrayContaining([
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
			]),
		);
		expect(fields).not.toContain('enabledToolIds');
		expect(
			reviewNode.uiSchema.find((item) => item.field === 'maxIterations'),
		).toMatchObject({
			label: 'Tool-loop max iterations per feedback turn (0 = unlimited)',
			default: 5,
			min: 0,
			max: Number.MAX_SAFE_INTEGER,
			step: 1,
		});
		expect(
			reviewNode.uiSchema.find(
				(item) => item.field === 'toolPermissions',
			),
		).toMatchObject({
			type: 'tool-permission-table',
			optionsSource: 'node.wiredTools',
		});
	});

	it('merges seeded agentsMarkdown into system history', async () => {
		let systemContent = '';
		const factory = async (args: CreateChatCompletionStreamArgs) => {
			const system = args.messages.find(
				(message) => message.role === 'system',
			);
			systemContent =
				typeof system?.content === 'string' ? system.content : '';

			return (async function* () {
				yield {
					kind: 'done' as const,
					text: '',
					tool_calls: [
						{
							id: 'a1',
							name: 'accept',
							arguments: JSON.stringify({ notes: 'ok' }),
						},
					],
				};
			})();
		};

		const runtime = new RuntimeFacade({ log: false });
		const review = reviewNode.getInstance();
		const taskStr = stringNode.getInstance();
		const resultStr = stringNode.getInstance();

		taskStr.inputs.value.connect(of('Criteria'));
		resultStr.inputs.value.connect(of('Draft'));

		runtime.editor.addNode({
			nodeId: 'task-1',
			inputs: taskStr.inputs,
			outputs: taskStr.outputs,
			bypassPorts: taskStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'result-1',
			inputs: resultStr.inputs,
			outputs: resultStr.outputs,
			bypassPorts: resultStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'review-1',
			inputs: review.inputs,
			outputs: review.outputs,
			bypassPorts: review.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'task-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['task', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'result-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['result', 0],
		});

		const donePromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.state === 'value' &&
						event.nodeId === 'review-1' &&
						event.portId === 'response',
				),
			),
		);

		runtime.runner.start({
			'task-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'task-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'result-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'result-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'review-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: reviewNodeContext(
						'review-1',
						{
							providerId: 'mock',
							model: 'mock/fast',
							includeAgentsMd: true,
							maxIterations: 5,
						},
						factory,
						{ agentsMarkdown: '# Project agents rules' },
					),
				},
			],
		});

		await donePromise;
		expect(systemContent).toContain('You are a strict Review node.');
		expect(systemContent).toContain('# Project agents rules');
		runtime.runner.interrupt('cancel');
	});

	it('feedback tool → feedback port; no response emit', async () => {
		const factory = async (_args: CreateChatCompletionStreamArgs) =>
			(async function* () {
				yield {
					kind: 'done' as const,
					text: '',
					tool_calls: [
						{
							id: 'f1',
							name: 'feedback',
							arguments: JSON.stringify({
								notes: 'Rewrite the intro',
							}),
						},
					],
				};
			})();

		const runtime = new RuntimeFacade({ log: false });
		const review = reviewNode.getInstance();
		const taskStr = stringNode.getInstance();
		const resultStr = stringNode.getInstance();

		taskStr.inputs.value.connect(of('Write a clear summary'));
		resultStr.inputs.value.connect(of('Draft text under review'));

		runtime.editor.addNode({
			nodeId: 'task-1',
			inputs: taskStr.inputs,
			outputs: taskStr.outputs,
			bypassPorts: taskStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'result-1',
			inputs: resultStr.inputs,
			outputs: resultStr.outputs,
			bypassPorts: resultStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'review-1',
			inputs: review.inputs,
			outputs: review.outputs,
			bypassPorts: review.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'task-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['task', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'result-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['result', 0],
		});

		const feedbackPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.state === 'value' &&
						event.nodeId === 'review-1' &&
						event.portId === 'feedback',
				),
			),
		);

		const responseEmissions: unknown[] = [];
		const responseSub = runtime.runner.events$.subscribe((event) => {
			if (
				event.kind === 'output-emitted' &&
				event.state === 'value' &&
				event.nodeId === 'review-1' &&
				event.portId === 'response'
			) {
				responseEmissions.push(event.value);
			}
		});

		runtime.runner.start({
			'task-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'task-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'result-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'result-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'review-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: reviewNodeContext(
						'review-1',
						{
							providerId: 'mock',
							model: 'mock/fast',
							maxIterations: 5,
						},
						factory,
					),
				},
			],
		});

		const feedbackEvent = await feedbackPromise;
		expect(feedbackEvent).toMatchObject({
			kind: 'output-emitted',
			value: 'Rewrite the intro',
		});
		expect(responseEmissions).toHaveLength(0);

		responseSub.unsubscribe();
		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('accept tool → response port passthrough of result', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const factory = async (args: CreateChatCompletionStreamArgs) => {
			captured.push(args);
			return (async function* () {
				yield {
					kind: 'done' as const,
					text: '',
					tool_calls: [
						{
							id: 'a1',
							name: 'accept',
							arguments: JSON.stringify({ notes: 'ok' }),
						},
					],
				};
			})();
		};

		const runtime = new RuntimeFacade({ log: false });
		const review = reviewNode.getInstance();
		const taskStr = stringNode.getInstance();
		const resultStr = stringNode.getInstance();

		taskStr.inputs.value.connect(of('Ship it'));
		resultStr.inputs.value.connect(of('Accepted artifact body'));

		runtime.editor.addNode({
			nodeId: 'task-1',
			inputs: taskStr.inputs,
			outputs: taskStr.outputs,
			bypassPorts: taskStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'result-1',
			inputs: resultStr.inputs,
			outputs: resultStr.outputs,
			bypassPorts: resultStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'review-1',
			inputs: review.inputs,
			outputs: review.outputs,
			bypassPorts: review.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'task-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['task', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'result-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['result', 0],
		});

		const responsePromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.state === 'value' &&
						event.nodeId === 'review-1' &&
						event.portId === 'response',
				),
			),
		);

		runtime.runner.start({
			'task-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'task-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'result-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'result-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'review-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: reviewNodeContext(
						'review-1',
						{
							providerId: 'mock',
							model: 'mock/fast',
						},
						factory,
					),
				},
			],
		});

		const responseEvent = await responsePromise;
		expect(responseEvent).toMatchObject({
			kind: 'output-emitted',
			value: 'Accepted artifact body',
		});
		expect(captured).toHaveLength(1);
		expect(
			captured[0]?.tools?.some((t) => t.function.name === 'accept'),
		).toBe(true);
		expect(
			captured[0]?.tools?.some((t) => t.function.name === 'feedback'),
		).toBe(true);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('text-only model output emits reminder on toolLog; no silent accept', async () => {
		let callIndex = 0;
		const factory = async (_args: CreateChatCompletionStreamArgs) => {
			const index = callIndex;
			callIndex += 1;

			return (async function* () {
				if (index === 0) {
					yield { kind: 'draft' as const, text: 'Looks good to me' };
					yield {
						kind: 'done' as const,
						text: 'Looks good to me',
					};
					return;
				}

				yield {
					kind: 'done' as const,
					text: '',
					tool_calls: [
						{
							id: 'f2',
							name: 'feedback',
							arguments: JSON.stringify({
								notes: 'Need more detail',
							}),
						},
					],
				};
			})();
		};

		const runtime = new RuntimeFacade({ log: false });
		const review = reviewNode.getInstance();
		const taskStr = stringNode.getInstance();
		const resultStr = stringNode.getInstance();

		taskStr.inputs.value.connect(of('Criteria'));
		resultStr.inputs.value.connect(of('Draft'));

		runtime.editor.addNode({
			nodeId: 'task-1',
			inputs: taskStr.inputs,
			outputs: taskStr.outputs,
			bypassPorts: taskStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'result-1',
			inputs: resultStr.inputs,
			outputs: resultStr.outputs,
			bypassPorts: resultStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'review-1',
			inputs: review.inputs,
			outputs: review.outputs,
			bypassPorts: review.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'task-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['task', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'result-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['result', 0],
		});

		const toolLogTexts: string[] = [];
		const responseEmissions: unknown[] = [];
		const eventsSub = runtime.runner.events$.subscribe((event) => {
			if (
				event.kind !== 'output-emitted' ||
				event.state !== 'value' ||
				event.nodeId !== 'review-1'
			) {
				return;
			}

			if (event.portId === 'toolLog') {
				toolLogTexts.push(String(event.value));
			}

			if (event.portId === 'response') {
				responseEmissions.push(event.value);
			}
		});

		const feedbackPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.state === 'value' &&
						event.nodeId === 'review-1' &&
						event.portId === 'feedback',
				),
			),
		);

		runtime.runner.start({
			'task-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'task-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'result-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'result-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'review-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: reviewNodeContext(
						'review-1',
						{
							providerId: 'mock',
							model: 'mock/fast',
							maxIterations: 5,
						},
						factory,
					),
				},
			],
		});

		const feedbackEvent = await feedbackPromise;
		expect(
			toolLogTexts.some((text) => text.includes(REVIEW_TOOL_REMINDER)),
		).toBe(true);
		expect(feedbackEvent).toMatchObject({
			kind: 'output-emitted',
			value: 'Need more detail',
		});
		expect(responseEmissions).toHaveLength(0);

		eventsSub.unsubscribe();
		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('second result turn sends prior feedback tool call in messages (session history)', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		let call = 0;
		const factory = async (args: CreateChatCompletionStreamArgs) => {
			captured.push(args);
			call += 1;
			const notes = call === 1 ? 'Add tests' : 'Still missing coverage';

			return (async function* () {
				yield {
					kind: 'done' as const,
					text: '',
					tool_calls: [
						{
							id: `f${call}`,
							name: 'feedback',
							arguments: JSON.stringify({ notes }),
						},
					],
				};
			})();
		};

		const runtime = new RuntimeFacade({ log: false });
		const review = reviewNode.getInstance();
		const taskStr = stringNode.getInstance();
		const resultStr = stringNode.getInstance();
		const result$ = new BehaviorSubject('Result v1');

		taskStr.inputs.value.connect(of('Ship with tests'));
		resultStr.inputs.value.connect(result$);

		runtime.editor.addNode({
			nodeId: 'task-1',
			inputs: taskStr.inputs,
			outputs: taskStr.outputs,
			bypassPorts: taskStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'result-1',
			inputs: resultStr.inputs,
			outputs: resultStr.outputs,
			bypassPorts: resultStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'review-1',
			inputs: review.inputs,
			outputs: review.outputs,
			bypassPorts: review.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'task-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['task', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'result-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['result', 0],
		});

		const waitFeedback = (nth: number) => {
			let count = 0;

			return firstValueFrom(
				runtime.runner.events$.pipe(
					filter((event) => {
						if (
							event.kind !== 'output-emitted' ||
							event.state !== 'value' ||
							event.nodeId !== 'review-1' ||
							event.portId !== 'feedback'
						) {
							return false;
						}

						count += 1;
						return count === nth;
					}),
				),
			);
		};

		const firstFeedback = waitFeedback(1);
		const secondFeedback = waitFeedback(2);

		runtime.runner.start({
			'task-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'task-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'result-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'result-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'review-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: reviewNodeContext(
						'review-1',
						{
							providerId: 'mock',
							model: 'mock/fast',
							maxIterations: 5,
						},
						factory,
					),
				},
			],
		});

		await firstFeedback;
		result$.next('Result v2');
		await secondFeedback;

		expect(captured).toHaveLength(2);
		expect(
			captured[1]?.messages.some(
				(message) =>
					message.role === 'tool' && message.content === 'Add tests',
			),
		).toBe(true);
		expect(String(captured[1]?.messages.at(-1)?.content)).toContain(
			'Result v2',
		);
		expect(captured[1]?.messages.length).toBeGreaterThan(2);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
