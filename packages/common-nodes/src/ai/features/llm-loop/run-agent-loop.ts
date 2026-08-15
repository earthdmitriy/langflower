import type { ToolHandle } from '@langflower/node-sdk';
import type { SteerControlPayload } from '@langflower/node-sdk/llm';
import type { Harness } from '@langflower/tools/create-project-harness';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import type { PermissionAskRequest } from '@langflower/tools/permission';
import type { Observable } from 'rxjs';
import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import type { SubAgentRegistration } from '../sub-agent-protocol.js';
import {
	buildSpawnSubagentChatTool,
	toChatToolDefinitions,
} from '../../../tools/inventory-tool-round.js';
import type { LlmCompactionConfig } from '../openai/normalize-compaction-params.js';
import { DISABLED_COMPACTION_CONFIG } from '../openai/normalize-compaction-params.js';
import {
	DEFAULT_LLM_RECOVERY_POLICY,
	type LlmRecoveryPolicy,
} from './llm-loop-types.js';
import {
	runLlmLoop,
	type LlmLoopPolicy,
	type SharedLlmLoopChunk,
} from './run-llm-loop.js';

export type ToolLoopChunk =
	SharedLlmLoopChunk | { readonly kind: 'response'; readonly text: string };

const AGENT_LOOP_POLICY: LlmLoopPolicy<ToolLoopChunk> = {
	decideCompletion: ({ text, toolCalls }) =>
		toolCalls.length > 0
			? { kind: 'run-tools', calls: toolCalls }
			: {
					kind: 'complete',
					chunks: [{ kind: 'response', text }],
				},
	maxIterationsFailure: (maxIterations) => {
		const text =
			`Stopped after ${maxIterations} tool-loop iterations ` +
			'(maxIterations).';
		return {
			kind: 'complete',
			chunks: [
				{ kind: 'toolLog', text },
				{ kind: 'response', text },
			],
		};
	},
};

export const runAgentLoop = (args: {
	readonly factory: CreateChatCompletionStream;
	readonly providerId: string;
	readonly model: string;
	readonly messages: readonly ChatCompletionMessage[];
	readonly tools: readonly ToolHandle[];
	readonly harness?: Harness;
	readonly toolCtx?: ToolHandlerContext;
	readonly maxIterations: number;
	readonly subagentRegistrations?: readonly SubAgentRegistration[];
	readonly compaction?: LlmCompactionConfig;
	readonly recovery?: LlmRecoveryPolicy;
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<'allow' | 'deny'>;
	readonly waitForSubagentResult?: (
		callId: string,
		signal: AbortSignal,
	) => Promise<string>;
	readonly steerControl$?: Observable<SteerControlPayload>;
}): Observable<ToolLoopChunk> => {
	const subagentRegistrations = args.subagentRegistrations ?? [];

	return runLlmLoop<ToolLoopChunk>({
		factory: args.factory,
		providerId: args.providerId,
		model: args.model,
		messages: args.messages,
		chatTools: [
			...toChatToolDefinitions(args.tools),
			...(subagentRegistrations.length > 0
				? [buildSpawnSubagentChatTool(subagentRegistrations)]
				: []),
		],
		inventoryTools: args.tools,
		maxIterations: args.maxIterations,
		compaction: args.compaction ?? DISABLED_COMPACTION_CONFIG,
		recovery: args.recovery ?? DEFAULT_LLM_RECOVERY_POLICY,
		policy: AGENT_LOOP_POLICY,
		subagentRegistrations,
		...(args.harness !== undefined ? { harness: args.harness } : {}),
		...(args.toolCtx !== undefined ? { toolCtx: args.toolCtx } : {}),
		...(args.requestPermission !== undefined
			? { requestPermission: args.requestPermission }
			: {}),
		...(args.waitForSubagentResult !== undefined
			? {
					waitForSubagentResult: args.waitForSubagentResult,
				}
			: {}),
		...(args.steerControl$ !== undefined
			? { steerControl$: args.steerControl$ }
			: {}),
	}) as Observable<ToolLoopChunk>;
};
