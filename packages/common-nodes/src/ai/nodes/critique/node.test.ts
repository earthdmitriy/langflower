import { contextSymbol } from '@langflower/node-sdk';
import type { CreateChatCompletionStreamArgs } from '../../features/chat-completion-stream.js';
import { RuntimeFacade } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { BehaviorSubject, filter, firstValueFrom, of } from 'rxjs';
import { stringNode } from '../../../primitives/string/node.js';
import { REVIEW_TOOL_REMINDER } from '../../features/path-choice/control-tools.js';
import { attachRunHostServices } from '../../features/run-host-services.js';
import { critiqueNode } from './node.js';

const critiqueNodeContext = (
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
) =>
	attachRunHostServices(
		{
			projectDir: '/tmp',
			runId: 'test',
			nodeId,
			params,
			uiSchema: critiqueNode.uiSchema,
		},
		{
			skillMarkdown: '',
			createChatCompletionStream: factory,
		},
	);

describe('common-critique', () => {
	it('shares llmPanelUiSchema floor with path-choice maxIterations', () => {
		expect(critiqueNode.type).toBe('common-critique');
		const fields = critiqueNode.uiSchema.map((item) => item.field);
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
			critiqueNode.uiSchema.find(
				(item) => item.field === 'maxIterations',
			),
		).toMatchObject({
			label: 'Tool-loop max iterations per feedback turn (0 = unlimited)',
			default: 5,
			min: 0,
			max: Number.MAX_SAFE_INTEGER,
			step: 1,
		});
		expect(
			critiqueNode.uiSchema.find(
				(item) => item.field === 'toolPermissions',
			),
		).toMatchObject({
			type: 'tool-permission-table',
			optionsSource: 'node.wiredTools',
		});
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
		const review = critiqueNode.getInstance();
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
			toPort: ['assignment', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'result-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['packet', 0],
		});

		const feedbackPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'value' in event[3] &&
						event[1] === 'review-1' &&
						event[2] === 'feedback',
				),
			),
		);

		const responseEmissions: unknown[] = [];
		const responseSub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] === 'out' &&
				'value' in event[3] &&
				event[1] === 'review-1' &&
				event[2] === 'response'
			) {
				responseEmissions.push(event[3].value);
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
					value: critiqueNodeContext(
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
		expect(feedbackEvent).toEqual(
			expect.arrayContaining([
				'out',
				expect.anything(),
				expect.anything(),
				{ value: 'Rewrite the intro' },
			]),
		);
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
		const review = critiqueNode.getInstance();
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
			toPort: ['assignment', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'result-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['packet', 0],
		});

		const responsePromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'value' in event[3] &&
						event[1] === 'review-1' &&
						event[2] === 'response',
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
					value: critiqueNodeContext(
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
		expect(responseEvent).toEqual(
			expect.arrayContaining([
				'out',
				expect.anything(),
				expect.anything(),
				{ value: 'Accepted artifact body' },
			]),
		);
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
		const review = critiqueNode.getInstance();
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
			toPort: ['assignment', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'result-1',
			fromPort: ['value', 0],
			toNodeId: 'review-1',
			toPort: ['packet', 0],
		});

		const toolLogTexts: string[] = [];
		const responseEmissions: unknown[] = [];
		const eventsSub = runtime.runner.events$.subscribe((event) => {
			if (
				event[0] !== 'out' ||
				!('value' in event[3]) ||
				event[1] !== 'review-1'
			) {
				return;
			}

			if (event[2] === 'toolLog') {
				toolLogTexts.push(String(event[3].value));
			}

			if (event[2] === 'response') {
				responseEmissions.push(event[3].value);
			}
		});

		const feedbackPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'value' in event[3] &&
						event[1] === 'review-1' &&
						event[2] === 'feedback',
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
					value: critiqueNodeContext(
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
		expect(feedbackEvent).toEqual(
			expect.arrayContaining([
				'out',
				expect.anything(),
				expect.anything(),
				{ value: 'Need more detail' },
			]),
		);
		expect(responseEmissions).toHaveLength(0);

		eventsSub.unsubscribe();
		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});

	it('second packet turn sends prior feedback tool call in messages (session history)', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		let call = 0;
		const factory = async (args: CreateChatCompletionStreamArgs) => {
			captured.push(args);
			call += 1;
			const notes =
				call === 1 ? 'Hole: missing evidence' : 'Still overclaiming';

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
		const critique = critiqueNode.getInstance();
		const assignmentStr = stringNode.getInstance();
		const packetStr = stringNode.getInstance();
		const packet$ = new BehaviorSubject('Packet v1');

		assignmentStr.inputs.value.connect(of('Defend soft harness'));
		packetStr.inputs.value.connect(packet$);

		runtime.editor.addNode({
			nodeId: 'assignment-1',
			inputs: assignmentStr.inputs,
			outputs: assignmentStr.outputs,
			bypassPorts: assignmentStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'packet-1',
			inputs: packetStr.inputs,
			outputs: packetStr.outputs,
			bypassPorts: packetStr.bypassPorts,
		});
		runtime.editor.addNode({
			nodeId: 'critique-1',
			inputs: critique.inputs,
			outputs: critique.outputs,
			bypassPorts: critique.bypassPorts,
		});
		runtime.editor.addEdge({
			fromNodeId: 'assignment-1',
			fromPort: ['value', 0],
			toNodeId: 'critique-1',
			toPort: ['assignment', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'packet-1',
			fromPort: ['value', 0],
			toNodeId: 'critique-1',
			toPort: ['packet', 0],
		});

		const waitFeedback = (nth: number) => {
			let count = 0;

			return firstValueFrom(
				runtime.runner.events$.pipe(
					filter((event) => {
						if (
							event[0] !== 'out' ||
							!('value' in event[3]) ||
							event[1] !== 'critique-1' ||
							event[2] !== 'feedback'
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
			'assignment-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'assignment-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'packet-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: {
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'packet-1',
						params: {},
						uiSchema: stringNode.uiSchema,
					},
				},
			],
			'critique-1': [
				{
					portId: contextSymbol,
					slotIndex: 0,
					value: critiqueNodeContext(
						'critique-1',
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
		expect(captured).toHaveLength(1);
		expect(captured[0]?.messages.map((message) => message.role)).toEqual([
			'system',
			'user',
		]);
		expect(String(captured[0]?.messages[1]?.content)).toContain(
			'Packet v1',
		);

		packet$.next('Packet v2 revised');
		await secondFeedback;

		expect(captured).toHaveLength(2);
		const roles = captured[1]?.messages.map((message) => message.role);
		expect(roles?.[0]).toBe('system');
		expect(roles).toContain('assistant');
		expect(roles).toContain('tool');
		expect(
			captured[1]?.messages.some(
				(message) =>
					message.role === 'tool' &&
					message.content === 'Hole: missing evidence',
			),
		).toBe(true);
		expect(String(captured[1]?.messages.at(-1)?.content)).toContain(
			'Packet v2 revised',
		);
		expect(captured[1]?.messages.length).toBeGreaterThan(2);

		runtime.runner.interrupt('cancel');
		runtime.runner.dispose();
		runtime.editor.dispose();
	});
});
