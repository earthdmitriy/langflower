import type { HitlUploadedFile } from '@langflower/node-sdk';
import { describe, expect, it } from 'vitest';
import type { ChatCompletionToolCall } from '../chat-completion-stream.js';
import { toOpenAiMessages } from '../openai/expand-chat-messages.js';
import { classifyLlmFailure } from './classify-llm-failure.js';
import { reduceLlmLoop } from './llm-loop-reducer.js';
import { initialLlmLoopState, type LlmLoopState } from './llm-loop-types.js';

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

	it('stores a steer image as a user turn and empty files as text', () => {
		const image = {
			fileId: 'img-1',
			name: 'photo.png',
			mimeType: 'image/png',
			size: 4,
		};
		const initial = initialLlmLoopState([
			{ role: 'user', content: 'build it' },
		]);
		const suspended = reduceLlmLoop(initial, {
			type: 'stream.idle',
			idleMs: 90_000,
		});
		const withImage = reduceLlmLoop(suspended, {
			type: 'steer.received',
			text: 'what is this',
			files: [image],
		});
		const withEmptyFiles = reduceLlmLoop(suspended, {
			type: 'steer.received',
			text: 'continue',
			files: [],
		});

		expect(withImage.committedMessages).toEqual([
			...initial.committedMessages,
			{
				role: 'user',
				content: { text: 'what is this', files: [image] },
			},
		]);
		expect(JSON.stringify(withImage.committedMessages)).not.toContain(
			'base64',
		);
		expect(withEmptyFiles.committedMessages).toEqual([
			...initial.committedMessages,
			{ role: 'user', content: 'continue' },
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

const toolCall = (id: string, filePath: string): ChatCompletionToolCall => ({
	id,
	name: 'read',
	arguments: JSON.stringify({ path: filePath }),
});

const uploaded = (
	fileId: string,
	name: string,
	mimeType: string,
	size: number,
): HitlUploadedFile => ({ fileId, name, mimeType, size });

const finishTools = (
	state: LlmLoopState,
	completed: readonly {
		readonly call: ChatCompletionToolCall;
		readonly result: string;
		readonly files?: readonly HitlUploadedFile[];
	}[],
): LlmLoopState => {
	const withCalls = reduceLlmLoop(state, {
		type: 'stream.done',
		text: '',
		toolCalls: completed.map((entry) => entry.call),
	});

	return completed.reduce(
		(current, entry) =>
			reduceLlmLoop(current, {
				type: 'tool.completed',
				call: entry.call,
				result: entry.result,
				...(entry.files !== undefined ? { files: entry.files } : {}),
			}),
		withCalls,
	);
};

describe('tool media hoist', () => {
	const png = uploaded('png-1', '1.png', 'image/png', 3);
	const mp3 = uploaded('mp3-1', 'a.mp3', 'audio/mpeg', 2);
	const pdf = uploaded('pdf-1', 'a.pdf', 'application/pdf', 1);
	const pngText = '1.png (image/png, 3 bytes)';
	const mp3Text = 'a.mp3 (audio/mpeg, 2 bytes)';
	const pdfText = 'a.pdf (application/pdf, 1 bytes)';

	const prepared = (): LlmLoopState => {
		const initial = initialLlmLoopState([
			{ role: 'user', content: 'what is in these files' },
		]);
		return reduceLlmLoop(initial, {
			type: 'round.prepared',
			messages: initial.committedMessages,
		});
	};

	it('places png, mp3, and pdf on one user turn after contiguous tool texts', async () => {
		const calls = [
			toolCall('c1', '1.png'),
			toolCall('c2', 'a.mp3'),
			toolCall('c3', 'a.pdf'),
			toolCall('c4', 'readme.txt'),
		];
		const done = finishTools(prepared(), [
			{ call: calls[0]!, result: pngText, files: [png] },
			{ call: calls[1]!, result: mp3Text, files: [mp3] },
			{ call: calls[2]!, result: pdfText, files: [pdf] },
			{ call: calls[3]!, result: 'hello from readme' },
		]);

		expect(done.committedMessages).toEqual([
			{ role: 'user', content: 'what is in these files' },
			{ role: 'assistant', content: '', tool_calls: calls },
			{ role: 'tool', content: pngText, tool_call_id: 'c1' },
			{ role: 'tool', content: mp3Text, tool_call_id: 'c2' },
			{ role: 'tool', content: pdfText, tool_call_id: 'c3' },
			{ role: 'tool', content: 'hello from readme', tool_call_id: 'c4' },
			{
				role: 'user',
				content: { text: '', files: [png, mp3, pdf] },
			},
		]);

		const serialized = JSON.stringify(done.committedMessages);
		expect(serialized).toContain('png-1');
		expect(serialized).not.toContain('base64');
		expect(serialized).not.toMatch(/data:/);

		for (const message of done.committedMessages) {
			if (message.role === 'tool') {
				expect(message.content).not.toMatch(/data:/);
				expect(message.content).not.toContain('base64');
			}
		}

		const pngBytes = Uint8Array.from([1, 2, 3]);
		const mp3Bytes = Uint8Array.from([4, 5]);
		const pdfBytes = Uint8Array.from([6]);
		const expanded = await toOpenAiMessages(done.committedMessages, {
			readSessionUpload: async (fileId) => {
				const bytes =
					fileId === 'png-1'
						? pngBytes
						: fileId === 'mp3-1'
							? mp3Bytes
							: fileId === 'pdf-1'
								? pdfBytes
								: undefined;
				return bytes === undefined
					? { ok: false, message: 'missing' }
					: { ok: true, bytes };
			},
		});

		const tools = expanded.filter((message) => message.role === 'tool');
		expect(tools.map((message) => message.content)).toEqual([
			pngText,
			mp3Text,
			pdfText,
			'hello from readme',
		]);
		expect(JSON.stringify(tools)).not.toMatch(/data:/);

		const hoist = expanded[expanded.length - 1];
		expect(hoist).toMatchObject({
			role: 'user',
			content: [
				{
					type: 'image_url',
					image_url: {
						url: expect.stringMatching(/^data:image\/png;base64,/),
					},
				},
				{
					type: 'input_audio',
					input_audio: { format: 'mp3' },
				},
				{
					type: 'file',
					file: {
						filename: 'a.pdf',
						file_data: expect.stringMatching(
							/^data:application\/pdf;base64,/,
						),
					},
				},
			],
		});
		expect(Array.isArray(hoist?.content) ? hoist.content : []).toHaveLength(
			3,
		);
	});

	it('does not add a user message for a video read', () => {
		const call = toolCall('c1', 'clip.mp4');
		const done = finishTools(prepared(), [
			{ call, result: 'not-an-image' },
		]);

		expect(done.committedMessages).toEqual([
			{ role: 'user', content: 'what is in these files' },
			{ role: 'assistant', content: '', tool_calls: [call] },
			{ role: 'tool', content: 'not-an-image', tool_call_id: 'c1' },
		]);
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
