import type {
	ChatCompletionMessage,
	ChatCompletionToolCall,
} from '../chat-completion-stream.js';

type LlmFailureKind =
	| 'authentication'
	| 'configuration'
	| 'context-overflow'
	| 'output-truncated'
	| 'rate-limit'
	| 'provider-unavailable'
	| 'stream-idle'
	| 'network'
	| 'tool-timeout'
	| 'subagent-timeout'
	| 'protocol'
	| 'unknown';

export type LlmFailure = {
	readonly kind: LlmFailureKind;
	readonly message: string;
	readonly recoverable: boolean;
	readonly status?: number;
	readonly retryAfterMs?: number;
	readonly rawContentType?: string;
};

type LlmSuspendReason =
	| { readonly kind: 'user-pause' }
	| { readonly kind: 'stream-idle'; readonly idleMs: number }
	| { readonly kind: 'provider-failure'; readonly failure: LlmFailure };

type LlmLoopPhase =
	| 'prepare'
	| 'streaming'
	| 'tools'
	| 'waiting-subagent'
	| 'suspended'
	| 'complete'
	| 'failed'
	| 'cancelled';

export type LlmLoopState = {
	readonly phase: LlmLoopPhase;
	readonly committedMessages: readonly ChatCompletionMessage[];
	readonly roundCheckpoint: readonly ChatCompletionMessage[];
	readonly iteration: number;
	readonly transientAttempts: number;
	readonly partial: {
		readonly reasoning: string;
		readonly draft: string;
		readonly toolCalls?: readonly ChatCompletionToolCall[];
	};
	readonly pendingToolCalls: readonly ChatCompletionToolCall[];
	readonly openSpawnCallId?: string | undefined;
	readonly suspendedBy?: LlmSuspendReason | undefined;
	readonly failure?: LlmFailure | undefined;
};

export type LlmLoopAction =
	| {
			readonly type: 'round.prepared';
			readonly messages: readonly ChatCompletionMessage[];
	  }
	| { readonly type: 'stream.reasoning'; readonly text: string }
	| { readonly type: 'stream.draft'; readonly text: string }
	| {
			readonly type: 'stream.done';
			readonly text: string;
			readonly toolCalls?: readonly ChatCompletionToolCall[];
	  }
	| { readonly type: 'stream.paused' }
	| { readonly type: 'stream.idle'; readonly idleMs: number }
	| { readonly type: 'provider.failed'; readonly failure: LlmFailure }
	| {
			readonly type: 'tool.completed';
			readonly call: ChatCompletionToolCall;
			readonly result: string;
	  }
	| { readonly type: 'subagent.waiting'; readonly callId: string }
	| { readonly type: 'subagent.completed' }
	| { readonly type: 'retry.scheduled' }
	| { readonly type: 'steer.received'; readonly text?: string }
	| { readonly type: 'round.completed' }
	| { readonly type: 'failure.fatal'; readonly failure: LlmFailure }
	| { readonly type: 'cancel.requested' };

export type LlmRecoveryPolicy = {
	readonly streamIdleTimeoutMs: number;
	readonly toolTimeoutMs: number;
	readonly subagentTimeoutMs: number;
	readonly maxTransientRetries: number;
	readonly retryBaseDelayMs: number;
	readonly maxToolResultChars: number;
};

export const DEFAULT_LLM_RECOVERY_POLICY: LlmRecoveryPolicy = {
	streamIdleTimeoutMs: 90_000,
	toolTimeoutMs: 60_000,
	subagentTimeoutMs: 300_000,
	maxTransientRetries: 2,
	retryBaseDelayMs: 1_000,
	maxToolResultChars: 40_000,
};

export const initialLlmLoopState = (
	messages: readonly ChatCompletionMessage[],
): LlmLoopState => ({
	phase: 'prepare',
	committedMessages: [...messages],
	roundCheckpoint: [...messages],
	iteration: 0,
	transientAttempts: 0,
	partial: {
		reasoning: '',
		draft: '',
	},
	pendingToolCalls: [],
});
