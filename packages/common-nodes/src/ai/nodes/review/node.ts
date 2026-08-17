import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../../features/chat-completion-stream.js';
import { filter, map, Observable, type Observable as RxObservable } from 'rxjs';
import {
	defineLlmNode,
	isSteerControlPayload,
	toLlmRecoveryPortValue,
	type SteerControlPayload,
} from '@langflower/node-sdk/llm';
import type { PermissionAskRequest } from '@langflower/tools/permission';
import { collectAgentToolHandles } from '../../../tools/collect-agent-tool-handles.js';
import { buildEffectiveSystemPrompt } from '../../features/prompt/build-effective-system-prompt.js';
import { resolveChatProviderModel } from '../../features/prompt/resolve-chat-provider-model.js';
import {
	createLlmSessionCycle$,
	demuxByKind,
	normalizeMaxFeedbackTurns,
} from '../../features/llm-session/llm-session-shell.js';
import { llmCompactionUiSchema } from '../../features/ui-schema/llm-compaction-ui-schema.js';
import { llmRecoveryUiSchema } from '../../features/ui-schema/llm-recovery-ui-schema.js';
import {
	llmMaxIterationsUiField,
	llmPanelUiSchema,
} from '../../features/ui-schema/llm-panel-ui-schema.js';
import {
	parseLlmRolePreset,
	resolveEffectiveSkillId,
} from '../../features/llm-role-preset.js';
import {
	DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
	PATH_CHOICE_MAX_ITERATIONS_CAP,
	normalizeMaxIterations,
} from '../../features/prompt/normalize-max-iterations.js';
import type { LlmRecoveryPolicy } from '../../features/llm-loop/llm-loop-types.js';
import { normalizeLlmRecoveryPolicy } from '../../features/llm-loop/normalize-llm-recovery-policy.js';
import { normalizeCompactionConfig } from '../../features/openai/normalize-compaction-params.js';
import type { LlmCompactionConfig } from '../../features/openai/normalize-compaction-params.js';
import type { ToolHandle } from '@langflower/node-sdk';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import {
	REVIEW_ACCEPT_TOOL,
	REVIEW_FEEDBACK_TOOL,
} from '../../features/path-choice/control-tools.js';
import {
	runPathChoiceToolLoop,
	type ReviewLoopChunk,
} from '../../features/path-choice/run-reactive-path-choice-loop.js';
import { getRunHostServices } from '../../features/run-host-services.js';

type ReviewChunk =
	| Exclude<ReviewLoopChunk, { kind: 'accept' }>
	| {
			readonly kind: 'accept';
			readonly notes: string;
			readonly result: string;
	  };

type ReviewContext = {
	readonly task: string;
	readonly providerId: string;
	readonly model: string;
	readonly skillId: string;
	readonly effectiveSystemPrompt: string;
	readonly skillMarkdown: string;
	readonly factory: CreateChatCompletionStream | undefined;
	readonly maxIterations: number;
	/** Shared session storm cap; 0 = unlimited (Review revise rounds). */
	readonly maxFeedbackTurns: number;
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<'allow' | 'deny'>;
	readonly tools: readonly ToolHandle[];
	readonly toolCtx: ToolHandlerContext;
	readonly compaction: LlmCompactionConfig;
	readonly recovery: LlmRecoveryPolicy;
	readonly steerControl$: RxObservable<SteerControlPayload>;
};

const FORCED_TOOL_SYSTEM = [
	'You are a strict Review node.',
	`Finish by calling exactly one control tool: ${REVIEW_ACCEPT_TOOL} or ${REVIEW_FEEDBACK_TOOL}.`,
	'You may call optional inventory tools first when they help verify the artifact.',
	'Do not write free-form accept/reject essays.',
	`Call ${REVIEW_ACCEPT_TOOL} when the result meets the task criteria.`,
	`Call ${REVIEW_FEEDBACK_TOOL} with revision notes when it does not.`,
].join(' ');

const requireChatConfig = (providerId: string, model: string): void => {
	if (providerId.trim().length === 0) {
		throw new Error('Provider is required for Review chat');
	}

	if (model.trim().length === 0) {
		throw new Error('Model is required for Review chat');
	}
};

const buildEffectiveReviewSystem = (input: {
	readonly rolePreset: ReturnType<typeof parseLlmRolePreset>;
	readonly systemPromptInput: string;
	readonly agentsMarkdown: string;
	readonly skillMarkdown: string;
}): string => {
	const merged = buildEffectiveSystemPrompt(input);
	const parts = [FORCED_TOOL_SYSTEM];

	if (merged.trim().length > 0) {
		parts.push(merged);
	}

	return parts.join('\n\n---\n\n');
};

const buildUserContent = (task: string, result: string): string =>
	[
		'## Task / criteria',
		task.trim().length > 0 ? task : '(empty task)',
		'',
		'## Result under review',
		result.trim().length > 0 ? result : '(empty result)',
	].join('\n');

const buildRevisedResultUserContent = (result: string): string =>
	[
		'## Revised result under review',
		result.trim().length > 0 ? result : '(empty result)',
	].join('\n');

const hasUserMessage = (history: readonly ChatCompletionMessage[]): boolean =>
	history.some((message) => message.role === 'user');

const runReviewTurn = (
	context: ReviewContext,
	result: string,
	history: readonly ChatCompletionMessage[],
): RxObservable<ReviewChunk> => {
	const factory = context.factory;

	if (factory === undefined) {
		return new Observable((subscriber) => {
			subscriber.error(
				new Error(
					'Review chat is only available during server workflow runs',
				),
			);
		});
	}

	requireChatConfig(context.providerId, context.model);

	const userContent = hasUserMessage(history)
		? buildRevisedResultUserContent(result)
		: buildUserContent(context.task, result);

	const messages: readonly ChatCompletionMessage[] = [
		...history,
		{ role: 'user', content: userContent },
	];

	return runPathChoiceToolLoop({
		factory,
		providerId: context.providerId,
		model: context.model,
		messages,
		maxIterations: context.maxIterations,
		tools: context.tools,
		compaction: context.compaction,
		recovery: context.recovery,
		steerControl$: context.steerControl$,
		toolCtx: context.toolCtx,
	}).pipe(
		map((chunk): ReviewChunk => {
			if (chunk.kind === 'accept') {
				return {
					kind: 'accept',
					notes: chunk.notes,
					result,
				};
			}

			return chunk;
		}),
	);
};

/**
 * Dedicated Review node: path choice via **Review-private** control tools
 * (`accept` / `feedback` in `path-choice/control-tools.ts`). Those chat tools are
 * ephemeral on completion calls only — they must not leak into shared
 * inventory / other LLM nodes. Tool payloads demux to `response` / `feedback`
 * ports; free-form replies get a reminder. Optional inventory / MCP /
 * Sub-Agents use shared LLM inventory ports.
 *
 * Session history uses the shared {@link createLlmSessionCycle$} (ADR-016):
 * init = task / system / inventory; turn driver = `result`.
 * @see docs/DONE/EPICS/03-review-node.md
 * @see docs/DONE/EPICS/MECHANICS-tool-execution.md
 */
export const reviewNode = defineLlmNode({
	type: 'common-review',
	displayName: 'Review',
	category: 'AI',
	description:
		'Forced-tool Review: finish with accept or feedback (requires a model with native tool / function calling — prose or markdown tool_code will not route). Optional wired tools / MCP / Sub-Agents may run via harness first.',
	uiSchema: [
		...llmPanelUiSchema.filter((item) => item.field !== 'maxIterations'),
		llmMaxIterationsUiField(
			DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
			PATH_CHOICE_MAX_ITERATIONS_CAP,
		),
		...llmCompactionUiSchema,
		...llmRecoveryUiSchema,
	] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }, inventory) {
		const { tools, steerControl } = inventory;
		const task = makeInput<string>('task', {
			name: 'task',
			wireType: 'string',
			inline: 'text-multiline',
			required: true,
		});
		const result = makeInput<string>('result', {
			name: 'result',
			wireType: 'string',
			inline: 'text-multiline',
			required: true,
		});
		const systemPrompt = makeInput<string>('systemPrompt', {
			name: 'systemPrompt',
			wireType: 'string',
			inline: 'text-multiline',
			defaultValue: '',
		});

		// Init peers only — result is the session turn driver (ADR-016).
		const context$ = combineInputs(
			[task, systemPrompt, tools, ctx],
			([taskValue, systemPromptValue, toolList, ec]) => {
				const rolePreset = parseLlmRolePreset(ec.params.rolePreset);
				const skillId = resolveEffectiveSkillId(
					rolePreset,
					ec.params.skillId,
				);
				const hostServices = getRunHostServices(ec);
				const skillMarkdown = hostServices?.skillMarkdown ?? '';
				const agentsMarkdown = hostServices?.agentsMarkdown ?? '';

				return {
					task: String(taskValue ?? ''),
					...resolveChatProviderModel(ec.params, hostServices),
					skillId,
					skillMarkdown,
					effectiveSystemPrompt: buildEffectiveReviewSystem({
						rolePreset,
						systemPromptInput: String(systemPromptValue ?? ''),
						agentsMarkdown,
						skillMarkdown,
					}),
					factory: hostServices?.createChatCompletionStream,
					maxIterations: normalizeMaxIterations(
						ec.params.maxIterations,
						{
							fallback: DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
							maxCap: PATH_CHOICE_MAX_ITERATIONS_CAP,
						},
					),
					maxFeedbackTurns: normalizeMaxFeedbackTurns(
						ec.params.maxFeedbackTurns,
					),
					...(hostServices?.requestPermission !== undefined
						? { requestPermission: hostServices.requestPermission }
						: {}),
					compaction: normalizeCompactionConfig(ec.params),
					recovery: normalizeLlmRecoveryPolicy(ec.params),
					steerControl$: steerControl.value$.pipe(
						filter(isSteerControlPayload),
					),
					tools: collectAgentToolHandles({
						toolHandles: ec.toolHandles,
						toolsPort: toolList,
					}),
					toolCtx: {
						projectDir: ec.projectDir,
						runId: ec.runId,
						...(hostServices?.authorize !== undefined
							? { authorize: hostServices.authorize }
							: {}),
						...(hostServices?.denyPaths !== undefined
							? { denyPaths: hostServices.denyPaths }
							: {}),
						...(hostServices?.allowedHosts !== undefined
							? { allowedHosts: hostServices.allowedHosts }
							: {}),
					},
				} satisfies ReviewContext;
			},
		);

		const cycle$ = createLlmSessionCycle$(
			context$,
			result.value$,
			(context) => ({
				history: [
					{
						role: 'system',
						content: context.effectiveSystemPrompt,
					},
				],
				trackAssistantHistory: false,
				appendUserFeedbackToHistory: false,
				session: undefined,
			}),
			(context, turnPayload, history) =>
				runReviewTurn(context, String(turnPayload ?? ''), history),
			{ primeTurn0: false },
		);

		const reasoning$ = cycle$.pipeValue(
			demuxByKind(
				'reasoning',
				(chunk) =>
					(chunk as Extract<ReviewChunk, { kind: 'reasoning' }>).text,
			),
		);
		const draftResponse$ = cycle$.pipeValue(
			demuxByKind(
				'draftResponse',
				(chunk) =>
					(chunk as Extract<ReviewChunk, { kind: 'draftResponse' }>)
						.text,
			),
		);
		const toolLog$ = cycle$.pipeValue(
			demuxByKind(
				'toolLog',
				(chunk) =>
					(chunk as Extract<ReviewChunk, { kind: 'toolLog' }>).text,
			),
		);
		const recovery$ = cycle$.pipeValue(
			demuxByKind('recoveryNotice', (chunk) => {
				const notice = chunk as Extract<
					ReviewChunk,
					{ kind: 'recoveryNotice' }
				>;
				return toLlmRecoveryPortValue(notice);
			}),
		);
		const response$ = cycle$.pipeValue(
			demuxByKind(
				'accept',
				(chunk) =>
					(chunk as Extract<ReviewChunk, { kind: 'accept' }>).result,
			),
		);
		const feedback$ = cycle$.pipeValue(
			demuxByKind(
				'feedback',
				(chunk) =>
					(chunk as Extract<ReviewChunk, { kind: 'feedback' }>).notes,
			),
		);

		return {
			inputs: [task, result, systemPrompt],
			outputs: [
				configureOutput('reasoning', reasoning$, {
					wireType: 'string',
					feed: { role: 'reasoning', streaming: true },
				}),
				configureOutput('draftResponse', draftResponse$, {
					wireType: 'string',
					feed: { role: 'draft', streaming: true },
				}),
				configureOutput('response', response$, {
					wireType: 'string',
					feed: { role: 'result' },
				}),
				configureOutput('feedback', feedback$, {
					wireType: 'string',
					feed: { role: 'result' },
				}),
			],
			inventoryOutputs: { toolLog$, recovery$ },
		};
	},
});
