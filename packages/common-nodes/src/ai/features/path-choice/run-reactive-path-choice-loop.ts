import type { ToolHandle } from '@langflower/node-sdk';
import type { SteerControlPayload } from '@langflower/node-sdk/llm';
import type { Harness } from '@langflower/tools/create-project-harness';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import type { Observable } from 'rxjs';
import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import {
	parseToolArgs,
	previewToolLogText,
	toChatToolDefinitions,
} from '../../../tools/inventory-tool-round.js';
import type { LlmCompactionConfig } from '../openai/normalize-compaction-params.js';
import { DISABLED_COMPACTION_CONFIG } from '../openai/normalize-compaction-params.js';
import {
	DEFAULT_LLM_RECOVERY_POLICY,
	type LlmRecoveryPolicy,
} from '../llm-loop/llm-loop-types.js';
import {
	runLlmLoop,
	type LlmLoopPolicy,
	type SharedLlmLoopChunk,
} from '../llm-loop/run-llm-loop.js';
import {
	findControlToolCall,
	isReviewControlToolName,
	notesFromControlToolArgs,
	REVIEW_CHAT_TOOLS,
	REVIEW_TOOL_REMINDER,
} from './control-tools.js';

export type ReviewLoopChunk =
	| SharedLlmLoopChunk
	| { readonly kind: 'reminder'; readonly text: string }
	| { readonly kind: 'accept'; readonly notes: string }
	| { readonly kind: 'feedback'; readonly notes: string };

const PATH_CHOICE_POLICY: LlmLoopPolicy<ReviewLoopChunk> = {
	decideCompletion: ({ state, text, toolCalls }) => {
		// Pre-tool base — never mid-scan committedMessages (orphan tool_calls).
		const base = state.roundCheckpoint;
		const control = findControlToolCall(toolCalls);
		if (control !== undefined) {
			const notes = notesFromControlToolArgs(
				parseToolArgs(control.call.arguments),
			);
			const messages: readonly ChatCompletionMessage[] = [
				...base,
				{
					role: 'assistant',
					content: text,
					tool_calls: [control.call],
				},
				{
					role: 'tool',
					tool_call_id: control.call.id,
					content: notes,
				},
			];
			return {
				kind: 'complete',
				chunks: [
					{ kind: 'historySync', messages },
					{
						kind: 'toolLog',
						text: `→ ${control.call.name}(${previewToolLogText(control.call.arguments)})`,
					},
					control.kind === 'accept'
						? { kind: 'accept', notes }
						: { kind: 'feedback', notes },
				],
			};
		}

		const inventoryCalls = toolCalls.filter(
			(call) => !isReviewControlToolName(call.name),
		);
		if (inventoryCalls.length > 0) {
			return { kind: 'run-tools', calls: inventoryCalls };
		}

		const assistantContent =
			text.trim().length > 0
				? text
				: '(no text; missing accept/feedback tool call)';
		return {
			kind: 'continue',
			messages: [
				...base,
				{ role: 'assistant', content: assistantContent },
				{ role: 'user', content: REVIEW_TOOL_REMINDER },
			],
			chunks: [
				{ kind: 'reminder', text: REVIEW_TOOL_REMINDER },
				{
					kind: 'toolLog',
					text: `⚠ ${REVIEW_TOOL_REMINDER}`,
				},
			],
		};
	},
	toolNotAllowedText: (toolName) =>
		`Tool «${toolName}» is not in the Review tools allowlist.`,
	maxIterationsFailure: (maxIterations) => ({
		kind: 'fail',
		failure: {
			kind: 'protocol',
			message:
				`Review failed after ${maxIterations} completions ` +
				'without accept or feedback (forced tool use).',
			recoverable: false,
		},
	}),
};

export const runPathChoiceToolLoop = (args: {
	readonly factory: CreateChatCompletionStream;
	readonly providerId: string;
	readonly model: string;
	readonly messages: readonly ChatCompletionMessage[];
	readonly maxIterations: number;
	readonly tools?: readonly ToolHandle[];
	readonly harness?: Harness;
	readonly toolCtx?: ToolHandlerContext;
	readonly compaction?: LlmCompactionConfig;
	readonly recovery?: LlmRecoveryPolicy;
	readonly steerControl$?: Observable<SteerControlPayload>;
}): Observable<ReviewLoopChunk> => {
	const inventory = args.tools ?? [];

	return runLlmLoop<ReviewLoopChunk>({
		factory: args.factory,
		providerId: args.providerId,
		model: args.model,
		messages: args.messages,
		maxIterations: args.maxIterations,
		inventoryTools: inventory,
		chatTools: [...REVIEW_CHAT_TOOLS, ...toChatToolDefinitions(inventory)],
		compaction: args.compaction ?? DISABLED_COMPACTION_CONFIG,
		recovery: args.recovery ?? DEFAULT_LLM_RECOVERY_POLICY,
		policy: PATH_CHOICE_POLICY,
		...(args.harness !== undefined ? { harness: args.harness } : {}),
		...(args.toolCtx !== undefined ? { toolCtx: args.toolCtx } : {}),
		...(args.steerControl$ !== undefined
			? { steerControl$: args.steerControl$ }
			: {}),
	}) as Observable<ReviewLoopChunk>;
};
