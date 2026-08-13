import type { LlmLoopAction, LlmLoopState } from './llm-loop-types.js';
import { autokickKickUserTurn } from './autokick-recovery.js';

const assertNever = (value: never): never => {
	throw new Error(`Unhandled LLM loop action: ${JSON.stringify(value)}`);
};

export const reduceLlmLoop = (
	state: LlmLoopState,
	action: LlmLoopAction,
): LlmLoopState => {
	switch (action.type) {
		case 'round.prepared':
			return {
				...state,
				phase: 'streaming',
				committedMessages: [...action.messages],
				roundCheckpoint: [...action.messages],
				partial: { reasoning: '', draft: '' },
				suspendedBy: undefined,
				failure: undefined,
			};
		case 'stream.reasoning':
			return {
				...state,
				partial: {
					...state.partial,
					reasoning: `${state.partial.reasoning}${action.text}`,
				},
			};
		case 'stream.draft':
			return {
				...state,
				partial: {
					...state.partial,
					draft: `${state.partial.draft}${action.text}`,
				},
			};
		case 'stream.done':
			if (action.toolCalls !== undefined && action.toolCalls.length > 0) {
				return {
					...state,
					phase: 'tools',
					committedMessages: [
						...state.committedMessages,
						{
							role: 'assistant',
							content:
								action.text.length > 0
									? action.text
									: state.partial.draft,
							tool_calls: action.toolCalls,
						},
					],
					partial: {
						...state.partial,
						draft:
							action.text.length > 0
								? action.text
								: state.partial.draft,
						toolCalls: action.toolCalls,
					},
					pendingToolCalls: action.toolCalls,
				};
			}

			return {
				...state,
				phase: 'complete',
				partial: {
					...state.partial,
					draft:
						action.text.length > 0
							? action.text
							: state.partial.draft,
				},
			};
		case 'stream.paused':
			return {
				...state,
				phase: 'suspended',
				committedMessages: [...state.roundCheckpoint],
				suspendedBy: { kind: 'user-pause' },
			};
		case 'stream.idle':
			return {
				...state,
				phase: 'suspended',
				committedMessages: [...state.roundCheckpoint],
				suspendedBy: {
					kind: 'stream-idle',
					idleMs: action.idleMs,
				},
			};
		case 'stream.dead-loop':
			return {
				...state,
				phase: 'suspended',
				committedMessages: [...state.roundCheckpoint],
				suspendedBy: {
					kind: 'dead-loop',
					channel: action.channel,
					reason: action.reason,
				},
			};
		case 'provider.failed':
			return {
				...state,
				phase: action.failure.recoverable ? 'suspended' : 'failed',
				committedMessages: [...state.roundCheckpoint],
				suspendedBy: action.failure.recoverable
					? {
							kind: 'provider-failure',
							failure: action.failure,
						}
					: undefined,
				failure: action.failure,
			};
		case 'tool.completed': {
			const pendingToolCalls = state.pendingToolCalls.slice(1);
			const messages = [
				...state.committedMessages,
				{
					role: 'tool' as const,
					content: action.result,
					tool_call_id: action.call.id,
				},
			];

			return {
				...state,
				phase: pendingToolCalls.length === 0 ? 'prepare' : 'tools',
				committedMessages: messages,
				roundCheckpoint:
					pendingToolCalls.length === 0
						? messages
						: state.roundCheckpoint,
				iteration:
					pendingToolCalls.length === 0
						? state.iteration + 1
						: state.iteration,
				transientAttempts:
					pendingToolCalls.length === 0 ? 0 : state.transientAttempts,
				partial:
					pendingToolCalls.length === 0
						? { reasoning: '', draft: '' }
						: state.partial,
				pendingToolCalls,
			};
		}
		case 'subagent.waiting':
			return {
				...state,
				phase: 'waiting-subagent',
				openSpawnCallId: action.callId,
			};
		case 'subagent.completed':
			return {
				...state,
				phase: 'tools',
				openSpawnCallId: undefined,
			};
		case 'retry.scheduled':
			return {
				...state,
				phase: 'prepare',
				committedMessages: [...state.roundCheckpoint],
				transientAttempts: state.transientAttempts + 1,
				partial: { reasoning: '', draft: '' },
				pendingToolCalls: [],
				suspendedBy: undefined,
				failure: undefined,
			};
		case 'autokick.scheduled':
			return {
				...state,
				phase: 'prepare',
				committedMessages:
					action.kickUserMessage === undefined
						? [...state.roundCheckpoint]
						: [
								...state.roundCheckpoint,
								autokickKickUserTurn(action.kickUserMessage),
							],
				autokickAttempts: state.autokickAttempts + 1,
				autokickKickAttempts:
					action.kickUserMessage === undefined
						? state.autokickKickAttempts
						: state.autokickKickAttempts + 1,
				lastAutokickAt: action.atMs,
				transientAttempts: 0,
				partial: { reasoning: '', draft: '' },
				pendingToolCalls: [],
				suspendedBy: undefined,
				failure: undefined,
			};
		case 'steer.received': {
			const text = action.text?.trim() ?? '';
			const messages =
				text.length === 0
					? [...state.roundCheckpoint]
					: [
							...state.roundCheckpoint,
							{ role: 'user' as const, content: text },
						];

			return {
				...state,
				phase: 'prepare',
				committedMessages: messages,
				roundCheckpoint: messages,
				transientAttempts: 0,
				autokickAttempts: 0,
				autokickKickAttempts: 0,
				lastAutokickAt: undefined,
				partial: { reasoning: '', draft: '' },
				pendingToolCalls: [],
				suspendedBy: undefined,
				failure: undefined,
			};
		}
		case 'round.completed':
			return { ...state, phase: 'complete' };
		case 'failure.fatal':
			return {
				...state,
				phase: 'failed',
				failure: action.failure,
			};
		case 'cancel.requested':
			return { ...state, phase: 'cancelled' };
		default:
			return assertNever(action);
	}
};
