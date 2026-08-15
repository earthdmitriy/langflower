import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../../features/chat-completion-stream.js';
import { Observable, type Observable as RxObservable } from 'rxjs';
import { defineLlmNode } from '@langflower/node-sdk/llm';
import { llmPanelUiSchema } from '../../features/ui-schema/llm-panel-ui-schema.js';
import { llmCompactionUiSchema } from '../../features/ui-schema/llm-compaction-ui-schema.js';
import { llmRecoveryUiSchema } from '../../features/ui-schema/llm-recovery-ui-schema.js';
import {
	appendToolInventory,
	bindLlmAgentSession,
	type LlmAgentInventoryContext,
} from '../../features/llm-session/llm-session-shell.js';
import {
	runAgentLoop,
	type ToolLoopChunk,
} from '../../features/llm-loop/run-agent-loop.js';
import { waitForSubagentResult } from '../../features/wait-for-subagent-result.js';
import { getRunHostServices } from '../../features/run-host-services.js';

type OpenAiLlmChunk = ToolLoopChunk;

type OpenAiLlmContext = LlmAgentInventoryContext & {
	readonly factory: CreateChatCompletionStream | undefined;
};

const requireChatConfig = (providerId: string, model: string): void => {
	if (providerId.trim().length === 0) {
		throw new Error('Provider is required for OpenAI-compatible chat');
	}

	if (model.trim().length === 0) {
		throw new Error('Model is required for OpenAI-compatible chat');
	}
};

const runOpenAiTurn = (
	context: OpenAiLlmContext,
	messages: readonly ChatCompletionMessage[],
	_feedback: string | undefined,
	subagentResult$: RxObservable<unknown>,
): RxObservable<OpenAiLlmChunk> => {
	const factory = context.factory;

	if (factory === undefined) {
		return new Observable((subscriber) => {
			subscriber.error(
				new Error(
					'OpenAI-compatible chat is only available during server workflow runs',
				),
			);
		});
	}

	requireChatConfig(context.providerId, context.model);

	return runAgentLoop({
		factory,
		providerId: context.providerId,
		model: context.model,
		messages: [...messages],
		tools: context.tools,
		toolCtx: context.toolCtx,
		maxIterations: context.maxIterations,
		compaction: context.compaction,
		recovery: context.recovery,
		subagentRegistrations: context.subagentRegistrations,
		...(context.requestPermission !== undefined
			? { requestPermission: context.requestPermission }
			: {}),
		...(context.steerControl$ !== undefined
			? { steerControl$: context.steerControl$ }
			: {}),
		...(context.subagentRegistrations.length > 0
			? {
					waitForSubagentResult: (callId, signal) =>
						waitForSubagentResult(
							subagentResult$,
							callId,
							signal,
							context.recovery.subagentTimeoutMs,
						),
				}
			: {}),
	});
};

/**
 * OpenAI-compatible LLM node: agent session with init context + feedback turns
 * and conversation history. Invokes allowlisted tools via `ctx.toolHandles` in an
 * internal tool loop (no per-call canvas edges).
 * @see docs/ADR.md ADR-016
 * @see docs/TODO/EPICS/01-tool-loop-builtins.md
 */
export const openAiLlmNode = defineLlmNode({
	type: 'common-openai-llm',
	displayName: 'OpenAI-compatible LLM',
	category: 'AI',
	description:
		'Streams chat completions from an OpenAI-compatible API. Invokes allowlisted builtins and mapped MCP tools via an internal tool loop (`ctx.toolHandles`).',
	uiSchema: [
		...llmPanelUiSchema,
		...llmCompactionUiSchema,
		...llmRecoveryUiSchema,
	] as const,
	bind(ctx, helpers, inventory) {
		return bindLlmAgentSession<OpenAiLlmContext, OpenAiLlmChunk>(
			ctx,
			helpers,
			inventory,
			{
				extendContext: (base, ec) => ({
					...base,
					factory: getRunHostServices(ec)?.createChatCompletionStream,
				}),
				prepareSession: (context) => ({
					history: [
						{
							role: 'system',
							content: appendToolInventory(
								context.effectiveSystemPrompt,
								context.tools,
							),
						},
						{ role: 'user', content: context.prompt },
					],
					trackAssistantHistory: true,
					appendUserFeedbackToHistory: true,
					session: undefined,
				}),
				runTurn: (context, feedback, history, subagentResult$) =>
					runOpenAiTurn(context, history, feedback, subagentResult$),
			},
		);
	},
});
