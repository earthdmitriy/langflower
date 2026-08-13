import type {
	ChatCompletionMessage,
	ChatCompletionStreamChunk,
	ChatCompletionToolDefinition,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import {
	classifyContextLengthError,
	isContextLengthExceededError,
} from './context-length-error.js';
import {
	compactMessagesWithSummary,
	estimateRequestTokens,
	resolveForceTargetTokens,
	resolveProactiveTargetTokens,
} from './llm-context-compaction.js';
import type { LlmCompactionConfig } from './normalize-compaction-params.js';
import { DISABLED_COMPACTION_CONFIG } from './normalize-compaction-params.js';

export type PreparedChatCompletion =
	| {
			readonly ok: true;
			readonly messages: readonly ChatCompletionMessage[];
			readonly stream: AsyncIterable<ChatCompletionStreamChunk>;
			readonly compaction?: {
				readonly reason: 'proactive' | 'context-error';
				readonly beforeTokens: number;
				readonly afterTokens: number;
			};
	  }
	| { readonly ok: false; readonly error: unknown };

const createMainStream = async (args: {
	readonly factory: CreateChatCompletionStream;
	readonly providerId: string;
	readonly model: string;
	readonly messages: readonly ChatCompletionMessage[];
	readonly tools: readonly ChatCompletionToolDefinition[];
	readonly signal?: AbortSignal;
	readonly frequency_penalty?: number;
	readonly presence_penalty?: number;
}): Promise<AsyncIterable<ChatCompletionStreamChunk>> =>
	args.factory({
		providerId: args.providerId,
		model: args.model,
		messages: args.messages,
		...(args.tools.length > 0 ? { tools: args.tools } : {}),
		...(args.signal !== undefined ? { signal: args.signal } : {}),
		...(args.frequency_penalty !== undefined
			? { frequency_penalty: args.frequency_penalty }
			: {}),
		...(args.presence_penalty !== undefined
			? { presence_penalty: args.presence_penalty }
			: {}),
	});

/**
 * Proactive + compact-on-error gate before consuming a chat stream.
 * Context retries happen only at create-stream time (pre reasoning/draft).
 */
export const prepareChatCompletion = async (args: {
	readonly factory: CreateChatCompletionStream;
	readonly providerId: string;
	readonly model: string;
	readonly messages: readonly ChatCompletionMessage[];
	readonly tools?: readonly ChatCompletionToolDefinition[];
	readonly signal?: AbortSignal;
	readonly compaction?: LlmCompactionConfig;
	readonly frequency_penalty?: number;
	readonly presence_penalty?: number;
}): Promise<PreparedChatCompletion> => {
	const tools = args.tools ?? [];
	const config = args.compaction ?? DISABLED_COMPACTION_CONFIG;
	let messages = args.messages;
	let compaction:
		| {
				readonly reason: 'proactive' | 'context-error';
				readonly beforeTokens: number;
				readonly afterTokens: number;
		  }
		| undefined;

	const proactiveTarget = resolveProactiveTargetTokens(config);

	if (
		proactiveTarget !== undefined &&
		estimateRequestTokens(messages, tools) > proactiveTarget
	) {
		const compacted = await compactMessagesWithSummary({
			factory: args.factory,
			providerId: args.providerId,
			model: args.model,
			messages,
			tools,
			targetTokens: proactiveTarget,
			...(args.signal !== undefined ? { signal: args.signal } : {}),
		});

		if (!compacted.ok) {
			return { ok: false, error: new Error(compacted.message) };
		}

		if (compacted.afterTokens < compacted.beforeTokens) {
			messages = compacted.messages;
			compaction = {
				reason: 'proactive',
				beforeTokens: compacted.beforeTokens,
				afterTokens: compacted.afterTokens,
			};
		}
	}

	try {
		const stream = await createMainStream({
			factory: args.factory,
			providerId: args.providerId,
			model: args.model,
			messages,
			tools,
			...(args.signal !== undefined ? { signal: args.signal } : {}),
			...(args.frequency_penalty !== undefined
				? { frequency_penalty: args.frequency_penalty }
				: {}),
			...(args.presence_penalty !== undefined
				? { presence_penalty: args.presence_penalty }
				: {}),
		});

		return {
			ok: true,
			messages,
			stream,
			...(compaction !== undefined ? { compaction } : {}),
		};
	} catch (error) {
		if (args.signal !== undefined && args.signal.aborted) {
			return { ok: false, error };
		}

		const contextError =
			classifyContextLengthError(error) ??
			(isContextLengthExceededError(error) ? error : undefined);

		if (contextError === undefined || !config.compactOnError) {
			return {
				ok: false,
				error: contextError ?? error,
			};
		}

		const forceTarget = resolveForceTargetTokens(
			config,
			estimateRequestTokens(messages, tools),
		);
		const compacted = await compactMessagesWithSummary({
			factory: args.factory,
			providerId: args.providerId,
			model: args.model,
			messages,
			tools,
			targetTokens: forceTarget,
			...(args.signal !== undefined ? { signal: args.signal } : {}),
		});

		if (!compacted.ok) {
			return { ok: false, error: new Error(compacted.message) };
		}

		messages = compacted.messages;
		compaction = {
			reason: 'context-error',
			beforeTokens: compacted.beforeTokens,
			afterTokens: compacted.afterTokens,
		};

		try {
			const stream = await createMainStream({
				factory: args.factory,
				providerId: args.providerId,
				model: args.model,
				messages,
				tools,
				...(args.signal !== undefined ? { signal: args.signal } : {}),
				...(args.frequency_penalty !== undefined
					? { frequency_penalty: args.frequency_penalty }
					: {}),
				...(args.presence_penalty !== undefined
					? { presence_penalty: args.presence_penalty }
					: {}),
			});

			return {
				ok: true,
				messages,
				stream,
				compaction,
			};
		} catch (retryError) {
			return {
				ok: false,
				error: classifyContextLengthError(retryError) ?? retryError,
			};
		}
	}
};
