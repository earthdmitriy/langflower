import {
	SESSION_UPLOAD_MAX_BYTES,
	type HitlUploadedFile,
} from '@langflower/node-sdk';
import { describe, expect, it } from 'vitest';
import type { ChatCompletionMessage } from '../chat-completion-stream.js';
import {
	toOpenAiMessages,
	type ReadSessionUpload,
} from './expand-chat-messages.js';

const base64 = (bytes: Uint8Array): string =>
	btoa(String.fromCharCode(...Array.from(bytes)));

const uploaded = (
	fileId: string,
	name: string,
	mimeType: string,
	bytes: Uint8Array,
): HitlUploadedFile => ({
	fileId,
	name,
	mimeType,
	size: bytes.byteLength,
});

const readerFor =
	(files: Readonly<Record<string, Uint8Array>>): ReadSessionUpload =>
	async (fileId) => {
		const bytes = files[fileId];

		if (bytes === undefined) {
			return { ok: false, message: 'Upload was not found' };
		}

		return { ok: true, bytes };
	};

const userTurn = (
	text: string,
	files: readonly HitlUploadedFile[],
): ChatCompletionMessage => ({
	role: 'user',
	content: { text, files },
});

describe('SESSION_UPLOAD_MAX_BYTES', () => {
	it('stays the 50 MB provider ceiling', () => {
		expect(SESSION_UPLOAD_MAX_BYTES).toBe(50 * 1024 * 1024);
	});
});

describe('toOpenAiMessages', () => {
	it('maps a legacy string user message to a string body', async () => {
		const messages = await toOpenAiMessages([
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: 'Hi' },
			{ role: 'assistant', content: 'ok' },
			{ role: 'tool', content: 'tool text', tool_call_id: 'call-1' },
		]);

		expect(messages).toEqual([
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: 'Hi' },
			{ role: 'assistant', content: 'ok' },
			{ role: 'tool', content: 'tool text', tool_call_id: 'call-1' },
		]);
	});

	it('expands images to image_url data URIs without detail', async () => {
		const cases = [
			['image/png', 'pixel.png', Uint8Array.from([1, 2, 3])],
			['image/jpeg', 'pixel.jpg', Uint8Array.from([4, 5])],
			['image/gif', 'pixel.gif', Uint8Array.from([6])],
			['image/webp', 'pixel.webp', Uint8Array.from([7, 8, 9])],
		] as const;
		const attachments = cases.map(([mimeType, name, bytes]) =>
			uploaded(name, name, mimeType, bytes),
		);
		const bytesById = Object.fromEntries(
			cases.map(([, name, bytes]) => [name, bytes]),
		);

		const messages = await toOpenAiMessages(
			[userTurn('what is this?', attachments)],
			{ readSessionUpload: readerFor(bytesById) },
		);

		expect(messages).toHaveLength(1);
		const message = messages[0];
		expect(message?.role).toBe('user');
		if (message?.role !== 'user' || typeof message.content === 'string') {
			throw new Error('expected user content parts');
		}

		expect(message.content[0]).toEqual({
			type: 'text',
			text: 'what is this?',
		});
		expect(message.content).toHaveLength(5);

		for (const [index, [mimeType, name, bytes]] of cases.entries()) {
			expect(message.content[index + 1]).toEqual({
				type: 'image_url',
				image_url: {
					url: `data:${mimeType};base64,${base64(bytes)}`,
				},
			});
		}
	});

	it('expands wav as input_audio wav and mpeg or mp3 as mp3', async () => {
		const wav = Uint8Array.from([1, 2, 3, 4]);
		const mpeg = Uint8Array.from([5, 6]);
		const mp3 = Uint8Array.from([7, 8, 9]);

		const messages = await toOpenAiMessages(
			[
				userTurn('listen', [
					uploaded('wav-id', 'clip.wav', 'audio/wav', wav),
					uploaded('mpeg-id', 'clip.mpeg', 'audio/mpeg', mpeg),
					uploaded('mp3-id', 'clip.mp3', 'audio/mp3', mp3),
				]),
			],
			{
				readSessionUpload: readerFor({
					'wav-id': wav,
					'mpeg-id': mpeg,
					'mp3-id': mp3,
				}),
			},
		);

		const message = messages[0];
		if (message?.role !== 'user' || typeof message.content === 'string') {
			throw new Error('expected user content parts');
		}

		expect(message.content).toEqual([
			{ type: 'text', text: 'listen' },
			{
				type: 'input_audio',
				input_audio: { data: base64(wav), format: 'wav' },
			},
			{
				type: 'input_audio',
				input_audio: { data: base64(mpeg), format: 'mp3' },
			},
			{
				type: 'input_audio',
				input_audio: { data: base64(mp3), format: 'mp3' },
			},
		]);
		const audio = message.content[1];
		if (audio?.type !== 'input_audio') {
			throw new Error('expected input_audio');
		}
		expect(audio.input_audio.data.startsWith('data:')).toBe(false);
	});

	it('expands a pdf as a file part with a data URI', async () => {
		const pdf = Uint8Array.from([9, 8, 7]);

		const messages = await toOpenAiMessages(
			[
				userTurn('read this', [
					uploaded('pdf-id', 'note.pdf', 'application/pdf', pdf),
				]),
			],
			{ readSessionUpload: readerFor({ 'pdf-id': pdf }) },
		);

		const message = messages[0];
		if (message?.role !== 'user' || typeof message.content === 'string') {
			throw new Error('expected user content parts');
		}

		expect(message.content).toEqual([
			{ type: 'text', text: 'read this' },
			{
				type: 'file',
				file: {
					filename: 'note.pdf',
					file_data: `data:application/pdf;base64,${base64(pdf)}`,
				},
			},
		]);
	});

	it('throws a turn error when a file is missing and does not continue', async () => {
		const seen: string[] = [];
		const png = Uint8Array.from([1]);

		await expect(
			toOpenAiMessages(
				[
					userTurn('q', [
						uploaded('missing', 'pixel.png', 'image/png', png),
						uploaded('later', 'other.png', 'image/png', png),
					]),
				],
				{
					readSessionUpload: async (fileId) => {
						seen.push(fileId);

						if (fileId === 'later') {
							return { ok: true, bytes: png };
						}

						return { ok: false, message: 'Upload was not found' };
					},
				},
			),
		).rejects.toThrow(
			'Missing uploaded file "pixel.png" (missing): Upload was not found',
		);
		expect(seen).toEqual(['missing']);
	});

	it('refuses a request whose files sum past the injected ceiling', async () => {
		const six = Uint8Array.from([1, 2, 3, 4, 5, 6]);

		await expect(
			toOpenAiMessages(
				[
					userTurn('both', [
						uploaded('a', 'a.png', 'image/png', six),
						uploaded('b', 'b.png', 'image/png', six),
					]),
				],
				{
					readSessionUpload: readerFor({ a: six, b: six }),
					maxUploadBytes: 10,
				},
			),
		).rejects.toThrow('Uploaded files in one request exceed 10 bytes');
	});
});
