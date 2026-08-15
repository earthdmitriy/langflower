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
			readonly role: 'system' | 'user';
			readonly content: string;
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
};

/** OpenAI-compatible chat stream factory (credentials resolved server-side). */
export type CreateChatCompletionStream = (
	args: CreateChatCompletionStreamArgs,
) => Promise<AsyncIterable<ChatCompletionStreamChunk>>;
