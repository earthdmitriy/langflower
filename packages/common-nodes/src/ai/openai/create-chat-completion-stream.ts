import type {
	ChatCompletionFinishReason,
	ChatCompletionMessage,
	ChatCompletionStreamChunk,
	ChatCompletionToolCall,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import OpenAI from 'openai';
import {
	classifyContextLengthError,
	ContextLengthExceededError,
} from './context-length-error.js';

export type {
	ChatCompletionAbortSignal,
	ChatCompletionFinishReason,
	ChatCompletionMessage,
	ChatCompletionStreamChunk,
	ChatCompletionToolCall,
	ChatCompletionToolDefinition,
	CreateChatCompletionStream,
	CreateChatCompletionStreamArgs,
} from '../chat-completion-stream.js';

export { ContextLengthExceededError, classifyContextLengthError };
export { isContextLengthExceededError } from './context-length-error.js';

export type OpenAiProviderCredentials = {
	readonly apiKey?: string;
	readonly baseURL?: string;
};

const requireNonEmpty = (value: string, label: string): string => {
	const trimmed = value.trim();

	if (trimmed.length === 0) {
		throw new Error(`${label} is required for OpenAI-compatible chat`);
	}

	return trimmed;
};

export const mapFinishReason = (
	value: string | null | undefined,
): ChatCompletionFinishReason => {
	switch (value) {
		case 'stop':
		case 'length':
		case 'tool_calls':
		case 'content_filter':
			return value;
		default:
			return 'unknown';
	}
};

const toOpenAiMessages = (
	messages: readonly ChatCompletionMessage[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] =>
	messages.map((message) => {
		if (message.role === 'tool') {
			return {
				role: 'tool',
				content: message.content,
				tool_call_id: message.tool_call_id,
			};
		}

		if (message.role === 'assistant' && message.tool_calls !== undefined) {
			return {
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
			};
		}

		return {
			role: message.role,
			content: message.content,
		};
	});

type ToolCallAccumulator = {
	id: string;
	name: string;
	arguments: string;
};

const mergeToolCallDelta = (
	acc: Map<number, ToolCallAccumulator>,
	index: number,
	delta: {
		readonly id?: string;
		readonly function?: {
			readonly name?: string;
			readonly arguments?: string;
		};
	},
): void => {
	const current = acc.get(index) ?? { id: '', name: '', arguments: '' };
	acc.set(index, {
		id:
			delta.id !== undefined && delta.id.length > 0
				? delta.id
				: current.id,
		name:
			delta.function?.name !== undefined && delta.function.name.length > 0
				? `${current.name}${delta.function.name}`
				: current.name,
		arguments:
			delta.function?.arguments !== undefined
				? `${current.arguments}${delta.function.arguments}`
				: current.arguments,
	});
};

const finalizeToolCalls = (
	acc: Map<number, ToolCallAccumulator>,
): readonly ChatCompletionToolCall[] =>
	[...acc.entries()]
		.sort(([a], [b]) => a - b)
		.map(([, call]) => ({
			id: call.id.length > 0 ? call.id : `call_${call.name}`,
			name: call.name,
			arguments: call.arguments,
		}))
		.filter((call) => call.name.length > 0);

/** LM Studio / DeepSeek-style CoT fields on OpenAI-compatible deltas. */
export const reasoningTextFromDelta = (delta: unknown): string => {
	if (delta === null || typeof delta !== 'object') {
		return '';
	}

	const record = delta as Record<string, unknown>;
	const reasoning = record['reasoning'];
	const reasoningContent = record['reasoning_content'];

	if (typeof reasoning === 'string' && reasoning.length > 0) {
		return reasoning;
	}

	if (typeof reasoningContent === 'string' && reasoningContent.length > 0) {
		return reasoningContent;
	}

	return '';
};

/**
 * Unbound OpenAI-compatible chat stream factory.
 * Caller supplies credential resolve (server injects secrets).
 */
export const createChatCompletionStream = (deps: {
	readonly resolveProvider: (
		providerId: string,
	) => Promise<OpenAiProviderCredentials>;
}): CreateChatCompletionStream => {
	return async (args) => {
		const providerId = requireNonEmpty(args.providerId, 'Provider');
		const model = requireNonEmpty(args.model, 'Model');
		const credentials = await deps.resolveProvider(providerId);

		const client = new OpenAI({
			apiKey: credentials.apiKey ?? 'local-no-key',
			...(credentials.baseURL !== undefined
				? { baseURL: credentials.baseURL }
				: {}),
		});

		const tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined =
			args.tools !== undefined && args.tools.length > 0
				? args.tools.map((tool) => ({
						type: 'function' as const,
						function: {
							name: tool.function.name,
							...(tool.function.description !== undefined
								? { description: tool.function.description }
								: {}),
							...(tool.function.parameters !== undefined
								? {
										parameters: tool.function
											.parameters as OpenAI.FunctionParameters,
									}
								: {}),
						},
					}))
				: undefined;

		let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

		try {
			stream = (await client.chat.completions.create(
				{
					model,
					messages: toOpenAiMessages(args.messages),
					stream: true,
					...(tools !== undefined ? { tools } : {}),
					...(args.frequency_penalty !== undefined
						? { frequency_penalty: args.frequency_penalty }
						: {}),
					...(args.presence_penalty !== undefined
						? { presence_penalty: args.presence_penalty }
						: {}),
				},
				{
					signal: args.signal as AbortSignal | undefined,
				},
			)) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
		} catch (error) {
			const contextError = classifyContextLengthError(error);

			if (contextError !== undefined) {
				throw contextError;
			}

			throw error;
		}

		async function* iterate(): AsyncGenerator<ChatCompletionStreamChunk> {
			let fullText = '';
			let lastFinishReason: ChatCompletionFinishReason | undefined;
			const toolAcc = new Map<number, ToolCallAccumulator>();

			for await (const chunk of stream) {
				const choice = chunk.choices[0];
				if (choice?.finish_reason !== undefined) {
					lastFinishReason = mapFinishReason(choice.finish_reason);
				}
				const delta = choice?.delta;
				const reasoningText = reasoningTextFromDelta(delta);

				if (reasoningText.length > 0) {
					yield { kind: 'reasoning', text: reasoningText };
				}

				const content = delta?.content;

				if (
					content !== undefined &&
					content !== null &&
					content.length > 0
				) {
					fullText += content;
					yield { kind: 'draft', text: content };
				}

				const toolDeltas = delta?.tool_calls;

				if (toolDeltas !== undefined) {
					for (const toolDelta of toolDeltas) {
						mergeToolCallDelta(
							toolAcc,
							toolDelta.index ?? 0,
							toolDelta,
						);
					}
				}
			}

			const tool_calls = finalizeToolCalls(toolAcc);
			yield {
				kind: 'done',
				text: fullText,
				finishReason: lastFinishReason ?? 'unknown',
				...(tool_calls.length > 0 ? { tool_calls } : {}),
			};
		}

		return iterate();
	};
};
