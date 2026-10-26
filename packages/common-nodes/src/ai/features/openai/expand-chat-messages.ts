import {
	SESSION_UPLOAD_MAX_BYTES,
	type HitlUploadedFile,
} from '@langflower/node-sdk';
import type OpenAI from 'openai';
import type {
	ChatCompletionMessage,
	ChatCompletionUserTurn,
} from '../chat-completion-stream.js';

/**
 * Bytes for one opaque `fileId`. The reader does not take a path.
 * Failure is a turn error at the chat factory: `prepareChatCompletion`
 * already maps a thrown `Error` from `createChatCompletionStream` to
 * `{ ok: false, error }`.
 */
export type ReadSessionUploadResult =
	| { readonly ok: true; readonly bytes: Uint8Array }
	| { readonly ok: false; readonly message: string };

export type ReadSessionUpload = (
	fileId: string,
) => Promise<ReadSessionUploadResult>;

export type ExpandChatMessagesOptions = {
	readonly readSessionUpload?: ReadSessionUpload;
	readonly maxUploadBytes?: number;
};

type OpenAiMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type OpenAiPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

const bytesToBase64 = (bytes: Uint8Array): string => {
	const chunkSize = 0x8000;
	let binary = '';

	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		const chunk = bytes.subarray(
			offset,
			Math.min(offset + chunkSize, bytes.length),
		);
		binary += String.fromCharCode(...Array.from(chunk));
	}

	return btoa(binary);
};

const audioFormat = (mimeType: string): 'wav' | 'mp3' | undefined => {
	if (mimeType === 'audio/wav') {
		return 'wav';
	}

	if (mimeType === 'audio/mpeg' || mimeType === 'audio/mp3') {
		return 'mp3';
	}

	return undefined;
};

const readUploadBytes = async (
	file: HitlUploadedFile,
	readSessionUpload: ReadSessionUpload | undefined,
): Promise<Uint8Array> => {
	if (readSessionUpload === undefined) {
		throw new Error(
			`Missing uploaded file "${file.name}" (${file.fileId}): no session upload reader`,
		);
	}

	const loaded = await readSessionUpload(file.fileId);

	if (!loaded.ok) {
		throw new Error(
			`Missing uploaded file "${file.name}" (${file.fileId}): ${loaded.message}`,
		);
	}

	return loaded.bytes;
};

const toContentPart = (
	file: HitlUploadedFile,
	bytes: Uint8Array,
): OpenAiPart => {
	if (
		file.mimeType === 'image/png' ||
		file.mimeType === 'image/jpeg' ||
		file.mimeType === 'image/gif' ||
		file.mimeType === 'image/webp'
	) {
		return {
			type: 'image_url',
			image_url: {
				url: `data:${file.mimeType};base64,${bytesToBase64(bytes)}`,
			},
		};
	}

	const format = audioFormat(file.mimeType);

	if (format !== undefined) {
		return {
			type: 'input_audio',
			input_audio: {
				data: bytesToBase64(bytes),
				format,
			},
		};
	}

	if (file.mimeType === 'application/pdf') {
		return {
			type: 'file',
			file: {
				filename: file.name,
				file_data: `data:application/pdf;base64,${bytesToBase64(bytes)}`,
			},
		};
	}

	throw new Error(
		`Unsupported upload MIME type ${file.mimeType} for ${file.name}`,
	);
};

const expandUserTurn = async (
	turn: ChatCompletionUserTurn,
	readSessionUpload: ReadSessionUpload | undefined,
	maxBytes: number,
	totalBytes: number,
): Promise<{
	readonly content: string | OpenAiPart[];
	readonly totalBytes: number;
}> => {
	if (turn.files.length === 0) {
		return { content: turn.text, totalBytes };
	}

	const parts: OpenAiPart[] = [];

	if (turn.text.length > 0) {
		parts.push({ type: 'text', text: turn.text });
	}

	let total = totalBytes;

	for (const file of turn.files) {
		const bytes = await readUploadBytes(file, readSessionUpload);

		if (bytes.byteLength >= maxBytes) {
			throw new Error(
				`Uploaded file "${file.name}" must be under ${maxBytes} bytes`,
			);
		}

		total += bytes.byteLength;

		if (total > maxBytes) {
			throw new Error(
				`Uploaded files in one request exceed ${maxBytes} bytes`,
			);
		}

		parts.push(toContentPart(file, bytes));
	}

	return { content: parts, totalBytes: total };
};

/** Map stored chat messages to the Chat Completions HTTP body. */
export const toOpenAiMessages = async (
	messages: readonly ChatCompletionMessage[],
	options?: ExpandChatMessagesOptions,
): Promise<OpenAiMessage[]> => {
	const maxBytes = options?.maxUploadBytes ?? SESSION_UPLOAD_MAX_BYTES;
	const readSessionUpload = options?.readSessionUpload;
	let totalBytes = 0;
	const mapped: OpenAiMessage[] = [];

	for (const message of messages) {
		if (message.role === 'tool') {
			mapped.push({
				role: 'tool',
				content: message.content,
				tool_call_id: message.tool_call_id,
			});
			continue;
		}

		if (message.role === 'assistant' && message.tool_calls !== undefined) {
			mapped.push({
				role: 'assistant',
				content: message.content.length > 0 ? message.content : null,
				tool_calls: message.tool_calls.map((call) => ({
					id: call.id,
					type: 'function' as const,
					function: {
						name: call.name,
						arguments: call.arguments,
					},
				})),
			});
			continue;
		}

		if (message.role === 'assistant' || message.role === 'system') {
			mapped.push({
				role: message.role,
				content: message.content,
			});
			continue;
		}

		if (typeof message.content === 'string') {
			mapped.push({ role: 'user', content: message.content });
			continue;
		}

		const expanded = await expandUserTurn(
			message.content,
			readSessionUpload,
			maxBytes,
			totalBytes,
		);
		totalBytes = expanded.totalBytes;
		mapped.push({ role: 'user', content: expanded.content });
	}

	return mapped;
};
