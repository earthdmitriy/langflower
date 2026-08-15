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
import {
	flattenSubAgentRegistrations,
	type SubAgentRegistration,
	type SubAgentSpawnPayload,
} from '../../features/sub-agent-protocol.js';
import type { ToolHandle } from '@langflower/node-sdk';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import { waitForSubagentResult } from '../../features/wait-for-subagent-result.js';
import {
	REVIEW_ACCEPT_TOOL,
	REVIEW_FEEDBACK_TOOL,
} from '../../features/path-choice/control-tools.js';
import {
	runPathChoiceToolLoop,
	type ReviewLoopChunk,
} from '../../features/path-choice/run-reactive-path-choice-loop.js';
import { getRunHostServices } from '../../features/run-host-services.js';

type CritiqueChunk =
	| Exclude<ReviewLoopChunk, { kind: 'accept' }>
	| {
			readonly kind: 'accept';
			readonly notes: string;
			readonly result: string;
	  };

type CritiqueContext = {
	readonly assignment: string;
	readonly providerId: string;
	readonly model: string;
	readonly skillId: string;
	readonly effectiveSystemPrompt: string;
	readonly skillMarkdown: string;
	readonly factory: CreateChatCompletionStream | undefined;
	readonly maxIterations: number;
	/** Shared session storm cap; 0 = unlimited (Critique revise rounds). */
	readonly maxFeedbackTurns: number;
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<'allow' | 'deny'>;
	readonly tools: readonly ToolHandle[];
	readonly subagentRegistrations: readonly SubAgentRegistration[];
	readonly toolCtx: ToolHandlerContext;
	readonly compaction: LlmCompactionConfig;
	readonly recovery: LlmRecoveryPolicy;
	readonly steerControl$: RxObservable<SteerControlPayload>;
};

const FORCED_TOOL_SYSTEM = [
	'You are an adversarial Critique node — not the author of the assignment.',
	`Finish by calling exactly one control tool: ${REVIEW_ACCEPT_TOOL} or ${REVIEW_FEEDBACK_TOOL}.`,
	'Do not complete or rewrite the original assignment yourself.',
	'Your job is to attack the packet: contradictions, overclaim, unsafe assumptions, missing evidence, scope creep.',
	'You may call optional inventory tools first when they help investigate.',
	'Do not write free-form accept/reject essays.',
	`Call ${REVIEW_FEEDBACK_TOOL} with concrete findings when the packet is not yet defensible.`,
	`Call ${REVIEW_ACCEPT_TOOL} only when further attack is non-blocking — agreed enough to stop critiquing.`,
].join(' ');

const requireChatConfig = (providerId: string, model: string): void => {
	if (providerId.trim().length === 0) {
		throw new Error('Provider is required for Critique chat');
	}

	if (model.trim().length === 0) {
		throw new Error('Model is required for Critique chat');
	}
};

const buildEffectiveCritiqueSystem = (input: {
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

const buildUserContent = (assignment: string, packet: string): string =>
	[
		'## Original assignment',
		assignment.trim().length > 0 ? assignment : '(empty assignment)',
		'',
		'## Packet to attack',
		packet.trim().length > 0 ? packet : '(empty packet)',
	].join('\n');

const buildRevisedPacketUserContent = (packet: string): string =>
	[
		'## Revised packet to attack',
		packet.trim().length > 0 ? packet : '(empty packet)',
	].join('\n');

const hasUserMessage = (history: readonly ChatCompletionMessage[]): boolean =>
	history.some((message) => message.role === 'user');

const runCritiqueTurn = (
	context: CritiqueContext,
	packet: string,
	history: readonly ChatCompletionMessage[],
	subagentResult$: RxObservable<unknown>,
): RxObservable<CritiqueChunk> => {
	const factory = context.factory;

	if (factory === undefined) {
		return new Observable((subscriber) => {
			subscriber.error(
				new Error(
					'Critique chat is only available during server workflow runs',
				),
			);
		});
	}

	requireChatConfig(context.providerId, context.model);

	const userContent = hasUserMessage(history)
		? buildRevisedPacketUserContent(packet)
		: buildUserContent(context.assignment, packet);

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
		subagentRegistrations: context.subagentRegistrations,
		toolCtx: context.toolCtx,
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
	}).pipe(
		map((chunk): CritiqueChunk => {
			if (chunk.kind === 'accept') {
				return {
					kind: 'accept',
					notes: chunk.notes,
					result: packet,
				};
			}

			return chunk;
		}),
	);
};

/**
 * Adversarial Critique: path choice via the same Review-private control tools
 * (`accept` / `feedback`). First input is the original assignment; second is
 * the packet under attack. Optional inventory / MCP / Sub-Agents may run first.
 *
 * Session history uses the shared {@link createLlmSessionCycle$} (ADR-016):
 * init = assignment / system / inventory; turn driver = `packet`.
 */
export const critiqueNode = defineLlmNode({
	type: 'common-critique',
	displayName: 'Critique',
	category: 'AI',
	description:
		'Adversarial Critique: first input is the original assignment/topic; second is the packet to attack. Finish with accept (agreed enough) or feedback (findings). Requires native tool / function calling. Optional wired tools / MCP / Sub-Agents may run via harness first.',
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
		const {
			tools,
			mcp,
			subagentRegistration,
			subagentResult,
			steerControl,
		} = inventory;
		const assignment = makeInput<string>('assignment', {
			name: 'assignment',
			wireType: 'string',
			inline: 'text-multiline',
			required: true,
		});
		const packet = makeInput<string>('packet', {
			name: 'packet',
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

		// Init peers only — packet is the session turn driver (ADR-016).
		const context$ = combineInputs(
			[assignment, systemPrompt, tools, subagentRegistration, mcp, ctx],
			([
				assignmentValue,
				systemPromptValue,
				toolList,
				subagentList,
				mcpList,
				ec,
			]) => {
				const rolePreset = parseLlmRolePreset(ec.params.rolePreset);
				const skillId = resolveEffectiveSkillId(
					rolePreset,
					ec.params.skillId,
				);
				const hostServices = getRunHostServices(ec);
				const skillMarkdown = hostServices?.skillMarkdown ?? '';
				const agentsMarkdown = hostServices?.agentsMarkdown ?? '';

				return {
					assignment: String(assignmentValue ?? ''),
					...resolveChatProviderModel(ec.params, hostServices),
					skillId,
					skillMarkdown,
					effectiveSystemPrompt: buildEffectiveCritiqueSystem({
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
						mcpHandles: ec.mcpHandles,
						mcpPort: mcpList,
					}),
					subagentRegistrations:
						flattenSubAgentRegistrations(subagentList),
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
				} satisfies CritiqueContext;
			},
		);

		const cycle$ = createLlmSessionCycle$(
			context$,
			packet.value$,
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
				runCritiqueTurn(
					context,
					String(turnPayload ?? ''),
					history,
					subagentResult.value$,
				),
			{ primeTurn0: false },
		);

		const reasoning$ = cycle$.pipeValue(
			demuxByKind(
				'reasoning',
				(chunk) =>
					(chunk as Extract<CritiqueChunk, { kind: 'reasoning' }>)
						.text,
			),
		);
		const draftResponse$ = cycle$.pipeValue(
			demuxByKind(
				'draftResponse',
				(chunk) =>
					(chunk as Extract<CritiqueChunk, { kind: 'draftResponse' }>)
						.text,
			),
		);
		const toolLog$ = cycle$.pipeValue(
			demuxByKind(
				'toolLog',
				(chunk) =>
					(chunk as Extract<CritiqueChunk, { kind: 'toolLog' }>).text,
			),
		);
		const recovery$ = cycle$.pipeValue(
			demuxByKind('recoveryNotice', (chunk) => {
				const notice = chunk as Extract<
					CritiqueChunk,
					{ kind: 'recoveryNotice' }
				>;
				return toLlmRecoveryPortValue(notice);
			}),
		);
		const response$ = cycle$.pipeValue(
			demuxByKind(
				'accept',
				(chunk) =>
					(chunk as Extract<CritiqueChunk, { kind: 'accept' }>)
						.result,
			),
		);
		const feedback$ = cycle$.pipeValue(
			demuxByKind(
				'feedback',
				(chunk) =>
					(chunk as Extract<CritiqueChunk, { kind: 'feedback' }>)
						.notes,
			),
		);
		const subagent$ = cycle$.pipeValue(
			demuxByKind(
				'subagentSpawn',
				(chunk): SubAgentSpawnPayload =>
					(chunk as Extract<CritiqueChunk, { kind: 'subagentSpawn' }>)
						.payload,
			),
		);

		return {
			inputs: [assignment, packet, systemPrompt],
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
			inventoryOutputs: { toolLog$, recovery$, subagent$ },
		};
	},
});
