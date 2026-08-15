import type { ChatCompletionMessage } from '../chat-completion-stream.js';
import { describe, expect, it } from 'vitest';
import {
	createChatCompletionStream,
	mapFinishReason,
	reasoningTextFromDelta,
} from './create-chat-completion-stream.js';

describe('mapFinishReason', () => {
	it('maps known OpenAI finish_reason values', () => {
		expect(mapFinishReason('stop')).toBe('stop');
		expect(mapFinishReason('length')).toBe('length');
		expect(mapFinishReason('tool_calls')).toBe('tool_calls');
		expect(mapFinishReason('content_filter')).toBe('content_filter');
	});

	it('maps null, undefined, and unknown strings to unknown', () => {
		expect(mapFinishReason(null)).toBe('unknown');
		expect(mapFinishReason(undefined)).toBe('unknown');
		expect(mapFinishReason('other')).toBe('unknown');
	});
});

describe('reasoningTextFromDelta', () => {
	it('reads delta.reasoning', () => {
		expect(reasoningTextFromDelta({ reasoning: 'think' })).toBe('think');
	});

	it('reads delta.reasoning_content when reasoning is absent', () => {
		expect(reasoningTextFromDelta({ reasoning_content: 'deepseek' })).toBe(
			'deepseek',
		);
	});

	it('prefers reasoning over reasoning_content', () => {
		expect(
			reasoningTextFromDelta({
				reasoning: 'a',
				reasoning_content: 'b',
			}),
		).toBe('a');
	});

	it('returns empty for missing or non-string fields', () => {
		expect(reasoningTextFromDelta(undefined)).toBe('');
		expect(reasoningTextFromDelta({})).toBe('');
		expect(reasoningTextFromDelta({ reasoning: 1 })).toBe('');
		expect(reasoningTextFromDelta({ reasoning: '' })).toBe('');
	});
});

describe('createChatCompletionStream', () => {
	it('throws safe errors when provider or model is missing', async () => {
		const factory = createChatCompletionStream({
			resolveProvider: async () => ({ apiKey: 'test' }),
		});

		await expect(
			factory({
				providerId: '',
				model: 'gpt-4o-mini',
				messages: [{ role: 'user', content: 'Hi' }],
			}),
		).rejects.toThrow(/Provider is required/);

		await expect(
			factory({
				providerId: 'openai',
				model: '',
				messages: [{ role: 'user', content: 'Hi' }],
			}),
		).rejects.toThrow(/Model is required/);
	});

	it('calls resolveProvider with the request providerId', async () => {
		const seen: string[] = [];
		const factory = createChatCompletionStream({
			resolveProvider: async (providerId) => {
				seen.push(providerId);
				throw new Error('stop-after-resolve');
			},
		});

		const messages: readonly ChatCompletionMessage[] = [
			{ role: 'user', content: 'Hi' },
		];

		await expect(
			factory({
				providerId: 'openai',
				model: 'gpt-4o-mini',
				messages,
			}),
		).rejects.toThrow(/stop-after-resolve/);

		expect(seen).toEqual(['openai']);
	});
});
