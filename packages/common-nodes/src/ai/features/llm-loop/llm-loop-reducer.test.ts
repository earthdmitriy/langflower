import { describe, expect, it } from 'vitest';
import { classifyLlmFailure } from './classify-llm-failure.js';
import { reduceLlmLoop } from './llm-loop-reducer.js';
import { initialLlmLoopState } from './llm-loop-types.js';

describe('reduceLlmLoop', () => {
	it('rolls a failed partial round back to its committed checkpoint', () => {
		const initial = initialLlmLoopState([
			{ role: 'user', content: 'build it' },
		]);
		const streaming = reduceLlmLoop(
			reduceLlmLoop(initial, {
				type: 'round.prepared',
				messages: initial.committedMessages,
			}),
			{ type: 'stream.draft', text: 'partial answer' },
		);
		const suspended = reduceLlmLoop(streaming, {
			type: 'provider.failed',
			failure: {
				kind: 'provider-unavailable',
				message: 'HTTP 500',
				recoverable: true,
			},
		});

		expect(suspended.phase).toBe('suspended');
		expect(suspended.committedMessages).toEqual(initial.committedMessages);
		expect(suspended.partial.draft).toBe('partial answer');
	});

	it('suspends a dead loop without committing uncommitted partial', () => {
		const initial = initialLlmLoopState([
			{ role: 'user', content: 'build it' },
		]);
		const streaming = reduceLlmLoop(
			reduceLlmLoop(initial, {
				type: 'round.prepared',
				messages: initial.committedMessages,
			}),
			{ type: 'stream.draft', text: 'loop loop loop' },
		);
		const suspended = reduceLlmLoop(streaming, {
			type: 'stream.dead-loop',
			channel: 'draft',
			reason: 'consecutive',
		});

		expect(suspended.phase).toBe('suspended');
		expect(suspended.committedMessages).toEqual(initial.committedMessages);
		expect(suspended.partial.draft).toBe('loop loop loop');
		expect(suspended.suspendedBy).toEqual({
			kind: 'dead-loop',
			channel: 'draft',
			reason: 'consecutive',
		});
	});

	it('appends Steer text once and Resume leaves checkpoint unchanged', () => {
		const initial = initialLlmLoopState([
			{ role: 'user', content: 'build it' },
		]);
		const suspended = reduceLlmLoop(initial, {
			type: 'stream.idle',
			idleMs: 90_000,
		});
		const resumed = reduceLlmLoop(suspended, {
			type: 'steer.received',
		});
		const steered = reduceLlmLoop(suspended, {
			type: 'steer.received',
			text: 'continue with smaller reads',
		});

		expect(resumed.committedMessages).toEqual(initial.committedMessages);
		expect(steered.committedMessages).toEqual([
			...initial.committedMessages,
			{ role: 'user', content: 'continue with smaller reads' },
		]);
	});

	it('schedules autokick from the checkpoint plus a kick user turn', () => {
		const initial = initialLlmLoopState([
			{ role: 'user', content: 'build it' },
		]);
		const streaming = reduceLlmLoop(
			reduceLlmLoop(initial, {
				type: 'round.prepared',
				messages: initial.committedMessages,
			}),
			{ type: 'stream.draft', text: 'loop loop loop' },
		);
		const suspended = reduceLlmLoop(streaming, {
			type: 'stream.dead-loop',
			channel: 'draft',
			reason: 'consecutive',
		});
		const scheduled = reduceLlmLoop(suspended, {
			type: 'autokick.scheduled',
			kickUserMessage: 'please stop repeating',
			atMs: 1_700_000_000_000,
		});

		expect(scheduled.phase).toBe('prepare');
		expect(scheduled.autokickAttempts).toBe(1);
		expect(scheduled.autokickKickAttempts).toBe(1);
		expect(scheduled.lastAutokickAt).toBe(1_700_000_000_000);
		expect(scheduled.partial.draft).toBe('');
		expect(scheduled.committedMessages).toEqual([
			{ role: 'user', content: 'build it' },
			{ role: 'user', content: 'please stop repeating' },
		]);
		expect(scheduled.committedMessages).not.toContainEqual({
			role: 'assistant',
			content: 'loop loop loop',
		});
	});

	it('replays HTTP autokick from the checkpoint without a kick turn', () => {
		const initial = initialLlmLoopState([
			{ role: 'user', content: 'build it' },
		]);
		const streaming = reduceLlmLoop(
			reduceLlmLoop(initial, {
				type: 'round.prepared',
				messages: initial.committedMessages,
			}),
			{ type: 'stream.draft', text: 'partial' },
		);
		const scheduled = reduceLlmLoop(streaming, {
			type: 'autokick.scheduled',
			atMs: 1_700_000_000_000,
		});

		expect(scheduled.phase).toBe('prepare');
		expect(scheduled.autokickAttempts).toBe(1);
		expect(scheduled.autokickKickAttempts).toBe(0);
		expect(scheduled.lastAutokickAt).toBe(1_700_000_000_000);
		expect(scheduled.committedMessages).toEqual(initial.committedMessages);
		expect(scheduled.partial.draft).toBe('');
	});
});

describe('classifyLlmFailure', () => {
	it('sanitizes opaque HTML 500 as recoverable provider failure', () => {
		const failure = classifyLlmFailure({
			status: 500,
			message:
				'500 <!DOCTYPE html><html><body>Internal Server Error</body></html>',
			headers: { 'content-type': 'text/html; charset=utf-8' },
		});

		expect(failure).toEqual({
			kind: 'provider-unavailable',
			message: 'Provider returned HTTP 500 with an HTML error response.',
			recoverable: true,
			status: 500,
			rawContentType: 'text/html; charset=utf-8',
		});
	});

	it('keeps authentication failures fatal', () => {
		expect(
			classifyLlmFailure({
				status: 401,
				message: 'Unauthorized',
			}),
		).toMatchObject({
			kind: 'authentication',
			recoverable: false,
		});
	});

	it('treats opaque unknown failures as recoverable', () => {
		expect(
			classifyLlmFailure({
				message: 'something opaque blew up',
			}),
		).toMatchObject({
			kind: 'unknown',
			recoverable: true,
		});
	});

	it('classifies compaction history failures as recoverable protocol', () => {
		expect(
			classifyLlmFailure(
				new Error(
					'Cannot compact history: incomplete assistant tool_calls / tool result block',
				),
			),
		).toMatchObject({
			kind: 'protocol',
			recoverable: true,
			message: expect.stringContaining('Cannot compact history:'),
		});
	});
});
