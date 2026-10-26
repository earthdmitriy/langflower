import type { HitlUploadedFile } from '@langflower/node-sdk';
import type { ReasoningEffortValue } from './openai/normalize-reasoning-effort.js';

/**
 * User turn stored in node state. `text` is the question. `files` cites
 * staged uploads by `fileId`. Bytes are not stored here.
 */
export type ChatCompletionUserTurn = {
	readonly text: string;
	readonly files: readonly HitlUploadedFile[];
};

/** True when `value` is a user turn (`text` plus a `files` array). */
export const isChatCompletionUserTurn = (
	value: unknown,
): value is ChatCompletionUserTurn =>
	value !== null &&
	typeof value === 'object' &&
	'text' in value &&
	typeof value.text === 'string' &&
	'files' in value &&
	Array.isArray(value.files);

export type ChatCompletionAbortSignal = {
	readonly aborted: boolean;
};

export type ChatCompletionToolCall = {
	readonly id: string;
	readonly name: string;
	/** JSON object string (OpenAI-compatible). */
	readonly arguments: string;
};

export type ChatCompletionMessage =
	| {
			readonly role: 'system';
			readonly content: string;
	  }
	| {
			readonly role: 'user';
			readonly content: string | ChatCompletionUserTurn;
	  }
	| {
			readonly role: 'assistant';
			readonly content: string;
			readonly tool_calls?: readonly ChatCompletionToolCall[];
	  }
	| {
			readonly role: 'tool';
			readonly content: string;
			readonly tool_call_id: string;
	  };

export type ChatCompletionToolDefinition = {
	readonly type: 'function';
	readonly function: {
		readonly name: string;
		readonly description?: string;
		readonly parameters?: object;
	};
};

export type ChatCompletionFinishReason =
	'stop' | 'length' | 'tool_calls' | 'content_filter' | 'unknown';

export type ChatCompletionStreamChunk =
	| { readonly kind: 'reasoning'; readonly text: string }
	| { readonly kind: 'draft'; readonly text: string }
	| {
			readonly kind: 'done';
			readonly text: string;
			readonly tool_calls?: readonly ChatCompletionToolCall[];
			readonly finishReason?: ChatCompletionFinishReason;
	  };

export type CreateChatCompletionStreamArgs = {
	readonly providerId: string;
	readonly model: string;
	readonly messages: readonly ChatCompletionMessage[];
	readonly tools?: readonly ChatCompletionToolDefinition[];
	readonly signal?: ChatCompletionAbortSignal;
	readonly frequency_penalty?: number;
	readonly presence_penalty?: number;
	readonly reasoning_effort?: ReasoningEffortValue;
};

/** OpenAI-compatible chat stream factory (credentials resolved server-side). */
export type CreateChatCompletionStream = (
	args: CreateChatCompletionStreamArgs,
) => Promise<AsyncIterable<ChatCompletionStreamChunk>>;
