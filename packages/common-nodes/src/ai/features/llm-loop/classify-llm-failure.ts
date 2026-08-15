import { isContextLengthExceededError } from '../openai/context-length-error.js';
import type { LlmFailure } from './llm-loop-types.js';

const readRecord = (value: unknown): Record<string, unknown> | undefined =>
	value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: undefined;

const readString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim().length > 0
		? value.trim()
		: undefined;

const readStatus = (record: Record<string, unknown>): number | undefined => {
	const value = record['status'] ?? record['statusCode'];
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: undefined;
};

const readHeader = (
	record: Record<string, unknown>,
	name: string,
): string | undefined => {
	const headers = readRecord(record['headers']);
	if (headers === undefined) {
		return undefined;
	}

	return readString(headers[name]) ?? readString(headers[name.toLowerCase()]);
};

const sanitizeMessage = (message: string, status?: number): string => {
	if (/<(?:!doctype|html|head|body|pre)\b/i.test(message)) {
		return status === undefined
			? 'Provider returned an HTML error response.'
			: `Provider returned HTTP ${status} with an HTML error response.`;
	}

	return message.length <= 500 ? message : `${message.slice(0, 499)}…`;
};

export const classifyLlmFailure = (error: unknown): LlmFailure => {
	if (isContextLengthExceededError(error)) {
		return {
			kind: 'context-overflow',
			message: sanitizeMessage(error.message),
			recoverable: true,
		};
	}

	const record = readRecord(error);
	const nestedError = readRecord(record?.['error']);
	const status = record === undefined ? undefined : readStatus(record);
	const rawMessage =
		readString(record?.['message']) ??
		readString(nestedError?.['message']) ??
		(error instanceof Error ? error.message : String(error));
	const message = sanitizeMessage(rawMessage, status);
	const rawContentType =
		record === undefined ? undefined : readHeader(record, 'content-type');
	const retryAfterRaw =
		record === undefined ? undefined : readHeader(record, 'retry-after');
	const retryAfterSeconds =
		retryAfterRaw === undefined ? Number.NaN : Number(retryAfterRaw);
	const retryAfterMs = Number.isFinite(retryAfterSeconds)
		? Math.max(0, retryAfterSeconds * 1_000)
		: undefined;
	const code =
		readString(record?.['code']) ?? readString(nestedError?.['code']);
	const messageLower = message.toLowerCase();

	if (
		status === 401 ||
		status === 403 ||
		/authentication|unauthorized|invalid api key|invalid_api_key/.test(
			messageLower,
		)
	) {
		return {
			kind: 'authentication',
			message,
			recoverable: false,
			...(status !== undefined ? { status } : {}),
		};
	}

	if (
		status === 404 ||
		/model .* not found|unknown model|provider is required|model is required/.test(
			messageLower,
		)
	) {
		return {
			kind: 'configuration',
			message,
			recoverable: false,
			...(status !== undefined ? { status } : {}),
		};
	}

	if (status === 429 || /rate.?limit/.test(messageLower)) {
		return {
			kind: 'rate-limit',
			message,
			recoverable: true,
			...(status !== undefined ? { status } : {}),
			...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
		};
	}

	if (status !== undefined && (status === 408 || status >= 500)) {
		return {
			kind: 'provider-unavailable',
			message,
			recoverable: true,
			status,
			...(rawContentType !== undefined ? { rawContentType } : {}),
		};
	}

	if (
		code === 'ECONNRESET' ||
		code === 'ECONNREFUSED' ||
		code === 'ETIMEDOUT' ||
		/network|socket|connection reset|fetch failed|timeout/.test(
			messageLower,
		)
	) {
		return {
			kind: 'network',
			message,
			recoverable: true,
		};
	}

	if (message.startsWith('Cannot compact history:')) {
		return {
			kind: 'protocol',
			message,
			recoverable: true,
		};
	}

	return {
		kind: 'unknown',
		message,
		recoverable: true,
		...(status !== undefined ? { status } : {}),
		...(rawContentType !== undefined ? { rawContentType } : {}),
	};
};
