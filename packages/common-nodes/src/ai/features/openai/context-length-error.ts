/**
 * Typed context-window overflow from OpenAI-compatible chat.create.
 * Detected before the stream yields reasoning/draft chunks.
 */
export class ContextLengthExceededError extends Error {
	readonly code = 'context_length_exceeded' as const;

	constructor(message = 'Context length exceeded') {
		super(message);
		this.name = 'ContextLengthExceededError';
	}
}

export const isContextLengthExceededError = (
	error: unknown,
): error is ContextLengthExceededError =>
	error instanceof ContextLengthExceededError;

const CONTEXT_MESSAGE_RE =
	/context[_ ]length|maximum context|context window|too many tokens|n_ctx|max_model_len|prompt is too long|exceeds? (?:the )?(?:maximum|model) (?:context|token)/i;

const readString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const readNested = (
	record: Record<string, unknown>,
	key: string,
): Record<string, unknown> | undefined => {
	const nested = record[key];

	return nested !== null && typeof nested === 'object'
		? (nested as Record<string, unknown>)
		: undefined;
};

/**
 * Classify provider/SDK errors thrown while creating a chat completion stream.
 * Structured fields win; narrow message fallback covers LM Studio / vLLM.
 */
export const classifyContextLengthError = (
	error: unknown,
): ContextLengthExceededError | undefined => {
	if (error instanceof ContextLengthExceededError) {
		return error;
	}

	if (error === null || typeof error !== 'object') {
		return undefined;
	}

	const record = error as Record<string, unknown>;
	const status =
		typeof record['status'] === 'number'
			? record['status']
			: typeof record['statusCode'] === 'number'
				? record['statusCode']
				: undefined;
	const code =
		readString(record['code']) ??
		readString(readNested(record, 'error')?.['code']);
	const type =
		readString(record['type']) ??
		readString(readNested(record, 'error')?.['type']);
	const message =
		readString(record['message']) ??
		readString(readNested(record, 'error')?.['message']) ??
		(error instanceof Error ? error.message : undefined);

	if (code === 'context_length_exceeded') {
		return new ContextLengthExceededError(
			message ?? 'Context length exceeded',
		);
	}

	if (
		type === 'invalid_request_error' &&
		message !== undefined &&
		CONTEXT_MESSAGE_RE.test(message)
	) {
		return new ContextLengthExceededError(message);
	}

	if (
		(status === 400 || status === undefined) &&
		message !== undefined &&
		CONTEXT_MESSAGE_RE.test(message)
	) {
		// Avoid false positives on rate-limit / auth wording.
		if (
			/rate[_ ]?limit|unauthorized|authentication|invalid[_ ]api[_ ]key|timeout/i.test(
				message,
			)
		) {
			return undefined;
		}

		return new ContextLengthExceededError(message);
	}

	return undefined;
};
