import { describe, expect, it } from 'vitest';
import {
	classifyContextLengthError,
	ContextLengthExceededError,
	isContextLengthExceededError,
} from './context-length-error.js';

describe('classifyContextLengthError', () => {
	it('accepts typed ContextLengthExceededError', () => {
		const error = new ContextLengthExceededError('too long');
		expect(classifyContextLengthError(error)).toBe(error);
		expect(isContextLengthExceededError(error)).toBe(true);
	});

	it('accepts structured OpenAI context_length_exceeded', () => {
		const classified = classifyContextLengthError({
			status: 400,
			code: 'context_length_exceeded',
			message: 'This model maximum context length is 8192 tokens',
		});

		expect(classified).toBeInstanceOf(ContextLengthExceededError);
		expect(classified?.message).toMatch(/8192/);
	});

	it('accepts nested error body wording', () => {
		const classified = classifyContextLengthError({
			status: 400,
			error: {
				type: 'invalid_request_error',
				message: 'Prompt is too long for max_model_len',
			},
		});

		expect(classified).toBeInstanceOf(ContextLengthExceededError);
	});

	it('rejects auth / rate-limit / timeout wording', () => {
		expect(
			classifyContextLengthError({
				status: 401,
				message: 'Unauthorized invalid api key',
			}),
		).toBeUndefined();
		expect(
			classifyContextLengthError({
				status: 429,
				message: 'Rate limit exceeded: too many tokens per minute',
			}),
		).toBeUndefined();
		expect(
			classifyContextLengthError(new Error('Request timeout')),
		).toBeUndefined();
	});
});
