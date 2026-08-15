import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import { describe, expect, it } from 'vitest';
import { ContextLengthExceededError } from './context-length-error.js';
import { prepareChatCompletion } from './prepare-chat-completion.js';
import { SUMMARY_SYSTEM_PROMPT } from './llm-context-compaction.js';

const longText = (tokens: number): string => 'x'.repeat(tokens * 4);

const isSummaryCall = (args: {
	readonly messages: readonly {
		readonly role: string;
		readonly content?: string;
	}[];
}): boolean =>
	args.messages.some(
		(message) =>
			message.role === 'system' &&
			message.content === SUMMARY_SYSTEM_PROMPT,
	);

describe('prepareChatCompletion', () => {
	it('passes through under budget without summary', async () => {
		let calls = 0;
		const factory: CreateChatCompletionStream = async () => {
			calls += 1;
			return (async function* () {
				yield { kind: 'done' as const, text: 'ok' };
			})();
		};

		const prepared = await prepareChatCompletion({
			factory,
			providerId: 'p',
			model: 'm',
			messages: [{ role: 'user', content: 'hi' }],
			compaction: { contextSize: 8192, compactOnError: false },
		});

		expect(prepared.ok).toBe(true);
		if (!prepared.ok) {
			return;
		}

		expect(prepared.compaction).toBeUndefined();
		expect(calls).toBe(1);
	});

	it('proactively compacts before main call', async () => {
		const callTools: Array<unknown> = [];
		const factory: CreateChatCompletionStream = async (args) => {
			callTools.push(args.tools);
			const isSummary = isSummaryCall(args);
			return (async function* () {
				yield {
					kind: 'done' as const,
					text: isSummary ? 'summary text' : 'final',
				};
			})();
		};

		const messages: ChatCompletionMessage[] = [
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: longText(2000) },
			{ role: 'assistant', content: longText(2000) },
			{ role: 'user', content: 'NOW' },
		];

		const prepared = await prepareChatCompletion({
			factory,
			providerId: 'p',
			model: 'm',
			messages,
			tools: [
				{
					type: 'function',
					function: { name: 'read', description: 'read' },
				},
			],
			compaction: { contextSize: 1000, compactOnError: false },
		});

		expect(prepared.ok).toBe(true);
		if (!prepared.ok) {
			return;
		}

		expect(prepared.compaction?.reason).toBe('proactive');
		expect(callTools[0]).toBeUndefined();
		expect(callTools.at(-1)).toEqual([
			{
				type: 'function',
				function: { name: 'read', description: 'read' },
			},
		]);
		expect(prepared.messages.at(-1)).toEqual({
			role: 'user',
			content: 'NOW',
		});
	});

	it('retries once on context error when compactOnError is true', async () => {
		let mainAttempts = 0;
		const factory: CreateChatCompletionStream = async (args) => {
			if (isSummaryCall(args)) {
				return (async function* () {
					yield { kind: 'done' as const, text: 'compacted' };
				})();
			}

			mainAttempts += 1;

			if (mainAttempts === 1) {
				throw new ContextLengthExceededError('overflow');
			}

			return (async function* () {
				yield { kind: 'done' as const, text: 'recovered' };
			})();
		};

		const prepared = await prepareChatCompletion({
			factory,
			providerId: 'p',
			model: 'm',
			messages: [
				{ role: 'system', content: 'sys' },
				{ role: 'user', content: longText(800) },
				{ role: 'assistant', content: longText(800) },
				{ role: 'user', content: 'NOW' },
			],
			compaction: { contextSize: 0, compactOnError: true },
		});

		expect(prepared.ok).toBe(true);
		if (!prepared.ok) {
			return;
		}

		expect(prepared.compaction?.reason).toBe('context-error');
		expect(mainAttempts).toBe(2);
	});

	it('does not retry when compactOnError is false', async () => {
		const factory: CreateChatCompletionStream = async () => {
			throw new ContextLengthExceededError('overflow');
		};

		const prepared = await prepareChatCompletion({
			factory,
			providerId: 'p',
			model: 'm',
			messages: [{ role: 'user', content: 'hi' }],
			compaction: { contextSize: 0, compactOnError: false },
		});

		expect(prepared.ok).toBe(false);
		if (prepared.ok) {
			return;
		}

		expect(prepared.error).toBeInstanceOf(ContextLengthExceededError);
	});
});
