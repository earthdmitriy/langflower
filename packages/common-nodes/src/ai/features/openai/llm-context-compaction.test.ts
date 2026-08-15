import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import { describe, expect, it, vi } from 'vitest';
import { ContextLengthExceededError } from './context-length-error.js';
import {
	compactMessagesWithSummary,
	estimateMessagesTokens,
	estimateRequestTokens,
	estimateToolsTokens,
} from './llm-context-compaction.js';

const longText = (tokens: number): string => 'x'.repeat(tokens * 4);

describe('estimate tokens', () => {
	it('counts message metadata and tool schemas', () => {
		const messages: ChatCompletionMessage[] = [
			{ role: 'system', content: 'sys' },
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: 'c1',
						name: 'read',
						arguments: '{"path":"a.ts"}',
					},
				],
			},
			{ role: 'tool', content: 'file body', tool_call_id: 'c1' },
		];
		const tools = [
			{
				type: 'function' as const,
				function: {
					name: 'read',
					description: 'read a file',
					parameters: {
						type: 'object',
						properties: { path: { type: 'string' } },
					},
				},
			},
		];

		expect(estimateMessagesTokens(messages)).toBeGreaterThan(10);
		expect(estimateToolsTokens(tools)).toBeGreaterThan(10);
		expect(estimateRequestTokens(messages, tools)).toBe(
			estimateMessagesTokens(messages) + estimateToolsTokens(tools),
		);
	});
});

describe('compactMessagesWithSummary', () => {
	it('preserves leading system and last user, replaces middle with summary', async () => {
		const factoryCalls: unknown[] = [];
		const factory: CreateChatCompletionStream = async (args) => {
			factoryCalls.push(args);
			return (async function* () {
				yield {
					kind: 'done' as const,
					text: 'Prior work decided to use tabs.',
				};
			})();
		};

		const messages: ChatCompletionMessage[] = [
			{ role: 'system', content: 'You are helpful.' },
			{ role: 'user', content: longText(800) },
			{ role: 'assistant', content: longText(800) },
			{ role: 'user', content: 'CURRENT_TASK' },
		];

		const result = await compactMessagesWithSummary({
			factory,
			providerId: 'p',
			model: 'm',
			messages,
			tools: [],
			targetTokens: 400,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}

		expect(result.messages[0]).toEqual({
			role: 'system',
			content: 'You are helpful.',
		});
		expect(result.messages.at(-1)).toEqual({
			role: 'user',
			content: 'CURRENT_TASK',
		});
		expect(
			result.messages.some(
				(message) =>
					message.role === 'user' &&
					message.content.startsWith(
						'## Compacted conversation context\n',
					),
			),
		).toBe(true);
		expect(factoryCalls).toHaveLength(1);
		expect((factoryCalls[0] as { tools?: unknown }).tools).toBeUndefined();
	});

	it('keeps assistant/tool blocks atomic', async () => {
		const factory: CreateChatCompletionStream = async () =>
			(async function* () {
				yield { kind: 'done' as const, text: 'summary' };
			})();

		const messages: ChatCompletionMessage[] = [
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: longText(500) },
			{ role: 'assistant', content: longText(500) },
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{ id: 'a', name: 'read', arguments: '{}' },
					{ id: 'b', name: 'grep', arguments: '{}' },
				],
			},
			{ role: 'tool', content: 'A', tool_call_id: 'a' },
			{ role: 'tool', content: 'B', tool_call_id: 'b' },
			{ role: 'user', content: 'NOW' },
		];

		const result = await compactMessagesWithSummary({
			factory,
			providerId: 'p',
			model: 'm',
			messages,
			tools: [],
			targetTokens: 300,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}

		const toolIndexes = result.messages
			.map((message, index) => (message.role === 'tool' ? index : -1))
			.filter((index) => index >= 0);

		for (const index of toolIndexes) {
			const prev = result.messages[index - 1];
			expect(prev?.role === 'assistant' || prev?.role === 'tool').toBe(
				true,
			);
		}

		expect(result.messages.at(-1)).toEqual({
			role: 'user',
			content: 'NOW',
		});
	});

	it('rejects orphan tool messages', async () => {
		const factory: CreateChatCompletionStream = async () =>
			(async function* () {
				yield { kind: 'done' as const, text: 'x' };
			})();

		const result = await compactMessagesWithSummary({
			factory,
			providerId: 'p',
			model: 'm',
			messages: [
				{ role: 'system', content: 'sys' },
				{ role: 'tool', content: 'orphan', tool_call_id: 'x' },
				{ role: 'user', content: 'u' },
			],
			tools: [],
			targetTokens: 10,
		});

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}

		expect(result.message).toMatch(/orphan tool/i);
	});

	it('rejects incomplete assistant tool_calls blocks', async () => {
		const factory: CreateChatCompletionStream = async () =>
			(async function* () {
				yield { kind: 'done' as const, text: 'x' };
			})();

		const result = await compactMessagesWithSummary({
			factory,
			providerId: 'p',
			model: 'm',
			messages: [
				{ role: 'system', content: 'sys' },
				{
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: 'a',
							name: 'read',
							arguments: '{}',
						},
						{
							id: 'b',
							name: 'grep',
							arguments: '{}',
						},
					],
				},
				{ role: 'tool', content: 'A only', tool_call_id: 'a' },
				{ role: 'user', content: 'u' },
			],
			tools: [],
			targetTokens: 10,
		});

		expect(result.ok).toBe(false);
		if (result.ok) {
			return;
		}

		expect(result.message).toMatch(
			/incomplete assistant tool_calls \/ tool result block/i,
		);
	});

	it('retries summary on context-length with smaller source budget', async () => {
		let calls = 0;
		const factory: CreateChatCompletionStream = async () => {
			calls += 1;

			if (calls === 1) {
				throw new ContextLengthExceededError('summary too big');
			}

			return (async function* () {
				yield { kind: 'done' as const, text: 'shrunk summary' };
			})();
		};

		const result = await compactMessagesWithSummary({
			factory,
			providerId: 'p',
			model: 'm',
			messages: [
				{ role: 'system', content: 'sys' },
				{ role: 'user', content: longText(600) },
				{ role: 'assistant', content: longText(600) },
				{ role: 'user', content: 'NOW' },
			],
			tools: [],
			targetTokens: 350,
		});

		expect(result.ok).toBe(true);
		expect(calls).toBe(2);
	});

	it('fails when required payload alone exceeds budget', async () => {
		const factory = vi.fn<CreateChatCompletionStream>();
		const result = await compactMessagesWithSummary({
			factory,
			providerId: 'p',
			model: 'm',
			messages: [
				{ role: 'system', content: longText(400) },
				{ role: 'user', content: longText(400) },
			],
			tools: [],
			targetTokens: 100,
		});

		expect(result.ok).toBe(false);
		expect(factory).not.toHaveBeenCalled();
	});
});
