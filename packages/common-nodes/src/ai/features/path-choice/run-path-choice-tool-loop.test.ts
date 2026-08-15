import type { ToolHandle } from '@langflower/node-sdk';
import type { Harness } from '@langflower/tools/create-project-harness';
import type { CreateChatCompletionStreamArgs } from '../chat-completion-stream.js';
import { describe, expect, it, vi } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';
import { REVIEW_CHAT_TOOLS, REVIEW_TOOL_REMINDER } from './control-tools.js';
import { runPathChoiceToolLoop } from './run-reactive-path-choice-loop.js';

const lookupTool = (
	toolId: string,
	invoke: ToolHandle['invoke'],
): ToolHandle => ({
	toolId,
	name: toolId,
	description: toolId,
	inputSchema: { type: 'object', properties: {} },
	invoke,
});

const allowHarness = (): Harness => ({
	invoke: vi.fn(async () => ({ ok: true as const, text: 'unused' })),
	authorize: async () => 'allow',
	listBuiltinRegistrations: () => [],
});

describe('runPathChoiceToolLoop', () => {
	it('forwards API reasoning before draftResponse', async () => {
		const factory = async (_args: CreateChatCompletionStreamArgs) =>
			(async function* () {
				yield { kind: 'reasoning' as const, text: 'check' };
				yield { kind: 'draft' as const, text: 'notes' };
				yield {
					kind: 'done' as const,
					text: 'notes',
					tool_calls: [
						{
							id: 'a1',
							name: 'accept',
							arguments: JSON.stringify({ notes: 'ok' }),
						},
					],
				};
			})();

		const chunks = await firstValueFrom(
			runPathChoiceToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock/fast',
				messages: [
					{ role: 'system', content: 'review' },
					{ role: 'user', content: 'task' },
				],
				maxIterations: 3,
			}).pipe(toArray()),
		);

		expect(chunks[0]).toEqual({ kind: 'reasoning', text: 'check' });
		expect(chunks.some((chunk) => chunk.kind === 'draftResponse')).toBe(
			true,
		);
	});

	it('passes Review control tools and routes feedback tool call', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		const factory = async (args: CreateChatCompletionStreamArgs) => {
			captured.push(args);
			return (async function* () {
				yield {
					kind: 'done' as const,
					text: '',
					tool_calls: [
						{
							id: 'f1',
							name: 'feedback',
							arguments: JSON.stringify({
								notes: 'Add edge-case coverage',
							}),
						},
					],
				};
			})();
		};

		const chunks = await firstValueFrom(
			runPathChoiceToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock/fast',
				messages: [
					{ role: 'system', content: 'review' },
					{ role: 'user', content: 'task' },
				],
				maxIterations: 3,
			}).pipe(toArray()),
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.tools).toEqual(REVIEW_CHAT_TOOLS);
		expect(chunks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'historySync',
					messages: expect.arrayContaining([
						expect.objectContaining({ role: 'assistant' }),
						expect.objectContaining({
							role: 'tool',
							content: 'Add edge-case coverage',
						}),
					]),
				}),
				expect.objectContaining({
					kind: 'toolLog',
					text: expect.stringContaining('→ feedback'),
				}),
				{
					kind: 'feedback',
					notes: 'Add edge-case coverage',
				},
			]),
		);
		expect(chunks.some((chunk) => chunk.kind === 'accept')).toBe(false);
	});

	it('routes accept tool call to accept chunk', async () => {
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
							arguments: JSON.stringify({ notes: 'LGTM' }),
						},
					],
				};
			})();
		};

		const chunks = await firstValueFrom(
			runPathChoiceToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock/fast',
				messages: [
					{ role: 'system', content: 'review' },
					{ role: 'user', content: 'task' },
				],
				maxIterations: 3,
			}).pipe(toArray()),
		);

		expect(captured[0]?.tools).toEqual(REVIEW_CHAT_TOOLS);
		expect(chunks).toContainEqual({ kind: 'accept', notes: 'LGTM' });
		const historySync = chunks.find(
			(chunk) => chunk.kind === 'historySync',
		);
		expect(historySync?.kind).toBe('historySync');
		if (historySync?.kind !== 'historySync') {
			return;
		}
		const assistantsWithTools = historySync.messages.filter(
			(message) =>
				message.role === 'assistant' &&
				(message.tool_calls?.length ?? 0) > 0,
		);
		expect(assistantsWithTools).toHaveLength(1);
		expect(assistantsWithTools[0]?.tool_calls).toEqual([
			{
				id: 'a1',
				name: 'accept',
				arguments: JSON.stringify({ notes: 'LGTM' }),
			},
		]);
		expect(
			historySync.messages.filter((message) => message.role === 'tool'),
		).toHaveLength(1);
	});

	it('text-only completion emits reminder and continues (no silent accept)', async () => {
		const captured: CreateChatCompletionStreamArgs[] = [];
		let callIndex = 0;

		const factory = async (args: CreateChatCompletionStreamArgs) => {
			captured.push(args);
			const index = callIndex;
			callIndex += 1;

			return (async function* () {
				if (index === 0) {
					yield { kind: 'draft' as const, text: 'LGTM looks fine' };
					yield {
						kind: 'done' as const,
						text: 'LGTM looks fine',
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
								notes: 'Still needs work',
							}),
						},
					],
				};
			})();
		};

		const chunks = await firstValueFrom(
			runPathChoiceToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock/fast',
				messages: [
					{ role: 'system', content: 'review' },
					{ role: 'user', content: 'task' },
				],
				maxIterations: 5,
			}).pipe(toArray()),
		);

		expect(captured).toHaveLength(2);
		expect(captured[0]?.tools).toEqual(REVIEW_CHAT_TOOLS);
		expect(captured[1]?.tools).toEqual(REVIEW_CHAT_TOOLS);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'reminder' &&
					chunk.text === REVIEW_TOOL_REMINDER,
			),
		).toBe(true);
		expect(chunks.some((chunk) => chunk.kind === 'accept')).toBe(false);
		expect(chunks).toContainEqual({
			kind: 'feedback',
			notes: 'Still needs work',
		});
		expect(
			captured[1]?.messages.some(
				(message) =>
					message.role === 'user' &&
					message.content === REVIEW_TOOL_REMINDER,
			),
		).toBe(true);
	});

	it('fails closed after maxIterations of non-compliance', async () => {
		const factory = async (_args: CreateChatCompletionStreamArgs) =>
			(async function* () {
				yield {
					kind: 'done' as const,
					text: 'approved without tools',
				};
			})();

		await expect(
			firstValueFrom(
				runPathChoiceToolLoop({
					factory,
					providerId: 'mock',
					model: 'mock/fast',
					messages: [
						{ role: 'system', content: 'review' },
						{ role: 'user', content: 'task' },
					],
					maxIterations: 2,
				}).pipe(toArray()),
			),
		).rejects.toThrow(/without accept or feedback/i);
	});

	it('inventory tool calls run without reminder; then accept finishes', async () => {
		const handler = vi.fn(async () =>
			JSON.stringify({ ok: true, excerpt: 'file body' }),
		);
		const harness = allowHarness();
		let callIndex = 0;

		const factory = async (args: CreateChatCompletionStreamArgs) => {
			const index = callIndex;
			callIndex += 1;

			return (async function* () {
				if (index === 0) {
					expect(
						args.tools?.some((t) => t.function.name === 'read'),
					).toBe(true);
					yield {
						kind: 'done' as const,
						text: '',
						tool_calls: [
							{
								id: 'r1',
								name: 'read',
								arguments: JSON.stringify({ path: 'a.md' }),
							},
						],
					};
					return;
				}

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

		const chunks = await firstValueFrom(
			runPathChoiceToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock/fast',
				messages: [
					{ role: 'system', content: 'review' },
					{ role: 'user', content: 'task' },
				],
				maxIterations: 5,
				tools: [lookupTool('read', handler)],
				harness,
				toolCtx: {
					projectDir: '/tmp',
					runId: 'review-loop',
				},
			}).pipe(toArray()),
		);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(chunks.some((chunk) => chunk.kind === 'reminder')).toBe(false);
		expect(chunks).toContainEqual({ kind: 'accept', notes: 'ok' });
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'toolLog' && chunk.text.includes('→ read('),
			),
		).toBe(true);
	});

	it('text-only reminder does not block a later inventory tool call', async () => {
		const handler = vi.fn(async () =>
			JSON.stringify({ ok: true, excerpt: 'checked' }),
		);
		const harness = allowHarness();
		let callIndex = 0;

		const factory = async (_args: CreateChatCompletionStreamArgs) => {
			const index = callIndex;
			callIndex += 1;

			return (async function* () {
				if (index === 0) {
					yield {
						kind: 'done' as const,
						text: 'Looks fine in prose',
					};
					return;
				}

				if (index === 1) {
					yield {
						kind: 'done' as const,
						text: '',
						tool_calls: [
							{
								id: 'r1',
								name: 'read',
								arguments: JSON.stringify({ path: 'b.md' }),
							},
						],
					};
					return;
				}

				yield {
					kind: 'done' as const,
					text: '',
					tool_calls: [
						{
							id: 'f1',
							name: 'feedback',
							arguments: JSON.stringify({
								notes: 'Fix section 2',
							}),
						},
					],
				};
			})();
		};

		const chunks = await firstValueFrom(
			runPathChoiceToolLoop({
				factory,
				providerId: 'mock',
				model: 'mock/fast',
				messages: [
					{ role: 'system', content: 'review' },
					{ role: 'user', content: 'task' },
				],
				maxIterations: 5,
				tools: [lookupTool('read', handler)],
				harness,
				toolCtx: {
					projectDir: '/tmp',
					runId: 'review-loop',
				},
			}).pipe(toArray()),
		);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(
			chunks.some(
				(chunk) =>
					chunk.kind === 'reminder' &&
					chunk.text === REVIEW_TOOL_REMINDER,
			),
		).toBe(true);
		expect(chunks).toContainEqual({
			kind: 'feedback',
			notes: 'Fix section 2',
		});
		expect(callIndex).toBe(3);
	});
});
