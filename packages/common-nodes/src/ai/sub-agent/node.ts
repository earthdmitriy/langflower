import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import {
	defineLlmNode,
	isSteerControlPayload,
	toLlmRecoveryPortValue,
} from '@langflower/node-sdk/llm';
import {
	concat,
	EMPTY,
	filter,
	mergeMap,
	Observable,
	of,
	type Observable as RxObservable,
} from 'rxjs';
import { llmPanelUiSchema } from '../llm-panel-ui-schema.js';
import { llmCompactionUiSchema } from '../llm-compaction-ui-schema.js';
import { llmRecoveryUiSchema } from '../llm-recovery-ui-schema.js';
import {
	AGENT_MAX_ITERATIONS_CAP,
	DEFAULT_AGENT_MAX_ITERATIONS,
	normalizeMaxIterations,
} from '../normalize-max-iterations.js';
import {
	appendToolInventory,
	createLlmSessionCycle$,
	demuxByKind,
	type LlmAgentInventoryContext,
} from '../llm-session-shell.js';
import {
	runAgentLoop,
	type ToolLoopChunk,
} from '../llm-loop/run-agent-loop.js';
import { waitForSubagentResult } from '../wait-for-subagent-result.js';
import {
	flattenSubAgentRegistrations,
	isSubAgentSpawnPayload,
	SUBAGENT_REGISTRATION_WIRE_TYPE,
	SUBAGENT_RESULT_WIRE_TYPE,
	SUBAGENT_SPAWN_WIRE_TYPE,
	type SubAgentRegistration,
	type SubAgentResultPayload,
	type SubAgentSpawnPayload,
} from '../sub-agent-protocol.js';
import { collectAgentToolHandles } from '../../tools/collect-agent-tool-handles.js';
import {
	parseLlmRolePreset,
	resolveEffectiveSkillId,
} from '../llm-role-preset.js';
import { resolveChatProviderModel } from '../resolve-chat-provider-model.js';
import { getRunHostServices } from '../run-host-services.js';
import { buildEffectiveSystemPrompt } from '../build-effective-system-prompt.js';
import { normalizeCompactionConfig } from '../openai/normalize-compaction-params.js';
import { normalizeLlmRecoveryPolicy } from '../llm-loop/normalize-llm-recovery-policy.js';
import {
	createScriptedFactory,
	parseScriptedTurns,
	type ScriptedTurn,
} from '../scripted-chat-completion-stream.js';

type SubAgentChunk =
	| ToolLoopChunk
	| {
			readonly kind: 'subagentResult';
			readonly payload: SubAgentResultPayload;
	  };

type SubAgentContext = LlmAgentInventoryContext & {
	readonly factory: CreateChatCompletionStream | undefined;
	readonly scriptedTurns: readonly ScriptedTurn[] | undefined;
	readonly nodeId: string;
	readonly skillIds: readonly string[];
};

const normalizeSkillIds = (raw: unknown): readonly string[] => {
	if (!Array.isArray(raw)) {
		return [];
	}

	return raw
		.map((entry) => String(entry ?? '').trim())
		.filter((entry) => entry.length > 0);
};

const acceptSpawn = (
	raw: unknown,
	nodeId: string,
	skillIds: readonly string[],
): SubAgentSpawnPayload | null => {
	if (!isSubAgentSpawnPayload(raw)) {
		return null;
	}

	if (raw.nodeId !== nodeId) {
		return null;
	}

	if (raw.skillId.length > 0 && !skillIds.includes(raw.skillId)) {
		return null;
	}

	return raw;
};

const formatSpawnUserContent = (spawn: SubAgentSpawnPayload): string => {
	if (spawn.skillId.length === 0) {
		return spawn.task;
	}

	return `[skill:${spawn.skillId}]\n${spawn.task}`;
};

const resolveTurnFactory = (
	context: SubAgentContext,
): CreateChatCompletionStream | undefined => {
	if (context.scriptedTurns !== undefined) {
		return createScriptedFactory(context.scriptedTurns);
	}

	return context.factory;
};

const requireChatConfig = (
	providerId: string,
	model: string,
	scripted: boolean,
): void => {
	if (scripted) {
		return;
	}

	if (providerId.trim().length === 0) {
		throw new Error('Provider is required for Sub-Agent chat');
	}

	if (model.trim().length === 0) {
		throw new Error('Model is required for Sub-Agent chat');
	}
};

const runSubAgentTurn = (
	context: SubAgentContext,
	spawn: SubAgentSpawnPayload,
	history: readonly ChatCompletionMessage[],
	subagentResult$: RxObservable<unknown>,
): RxObservable<SubAgentChunk> => {
	const scripted = context.scriptedTurns !== undefined;
	const factory = resolveTurnFactory(context);

	if (factory === undefined) {
		return new Observable((subscriber) => {
			subscriber.error(
				new Error(
					'Sub-Agent chat is only available during server workflow runs',
				),
			);
		});
	}

	requireChatConfig(context.providerId, context.model, scripted);

	return concat(
		of({
			kind: 'historySync' as const,
			messages: [
				...history,
				{
					role: 'user' as const,
					content: formatSpawnUserContent(spawn),
				},
			],
		}),
		runAgentLoop({
			factory,
			providerId: scripted
				? context.providerId.trim() || 'scripted'
				: context.providerId,
			model: scripted
				? context.model.trim() || 'scripted'
				: context.model,
			messages: [
				...history,
				{ role: 'user', content: formatSpawnUserContent(spawn) },
			],
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
		}).pipe(
			mergeMap((chunk): RxObservable<SubAgentChunk> => {
				if (chunk.kind !== 'response') {
					return of(chunk);
				}

				return of(chunk, {
					kind: 'subagentResult' as const,
					payload: {
						callId: spawn.callId,
						result: chunk.text,
					},
				});
			}),
		),
	);
};

/**
 * Sub-Agent: ordinary OpenAI-compatible agent plus `registration` announce.
 * Parent spawn arrives on `task`; final text returns on `result` with callId.
 * @see docs/ADR.md ADR-021
 */
export const subAgentNode = defineLlmNode({
	type: 'common-sub-agent',
	displayName: 'Sub-Agent',
	category: 'AI',
	description:
		'OpenAI-compatible specialist agent that announces via registration and answers parent spawns on task → result.',
	uiSchema: [
		{
			field: 'name',
			type: 'string',
			label: 'Name',
			default: 'Sub-Agent',
		},
		{
			field: 'description',
			type: 'string',
			label: 'Description',
			default: '',
		},
		{
			field: 'skillIds',
			type: 'tool-id-list',
			label: 'Skills',
			optionsSource: 'langflower.skills',
		},
		...llmPanelUiSchema,
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
		const systemPrompt = makeInput<string>('systemPrompt', {
			name: 'systemPrompt',
			wireType: 'string',
			inline: 'text-multiline',
			defaultValue: '',
		});
		const task = makeInput<unknown>('task', {
			name: 'task',
			wireType: SUBAGENT_SPAWN_WIRE_TYPE,
			required: true,
		});

		const registration$ = combineInputs([ctx], ([ec]) => {
			const skillIds = normalizeSkillIds(ec.params.skillIds);
			const name = String(ec.params.name ?? 'Sub-Agent').trim();
			const description = String(ec.params.description ?? '');

			return {
				targetNodeId: ec.nodeId,
				name: name.length > 0 ? name : 'Sub-Agent',
				description,
				skills: skillIds.map((skillId) => ({
					skillId,
					description: skillId,
				})),
			} satisfies SubAgentRegistration;
		});

		const context$ = combineInputs(
			[systemPrompt, tools, subagentRegistration, mcp, ctx],
			([systemPromptValue, toolList, subagentList, mcpList, ec]) => {
				const rolePreset = parseLlmRolePreset(ec.params.rolePreset);
				const skillId = resolveEffectiveSkillId(
					rolePreset,
					ec.params.skillId,
				);
				const hostServices = getRunHostServices(ec);
				const skillMarkdown = hostServices?.skillMarkdown ?? '';
				const agentsMarkdown = hostServices?.agentsMarkdown ?? '';

				return {
					prompt: '',
					tools: collectAgentToolHandles({
						toolHandles: ec.toolHandles,
						toolsPort: toolList,
						mcpHandles: ec.mcpHandles,
						mcpPort: mcpList,
					}),
					subagentRegistrations:
						flattenSubAgentRegistrations(subagentList),
					...resolveChatProviderModel(ec.params, hostServices),
					skillId,
					rolePreset,
					skillMarkdown,
					agentsMarkdown,
					effectiveSystemPrompt: buildEffectiveSystemPrompt({
						rolePreset,
						systemPromptInput: String(systemPromptValue ?? ''),
						agentsMarkdown,
						skillMarkdown,
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
					maxIterations: normalizeMaxIterations(
						ec.params.maxIterations,
						{
							fallback: DEFAULT_AGENT_MAX_ITERATIONS,
							maxCap: AGENT_MAX_ITERATIONS_CAP,
						},
					),
					maxFeedbackTurns: 0,
					...(hostServices?.requestPermission !== undefined
						? {
								requestPermission:
									hostServices.requestPermission,
							}
						: {}),
					compaction: normalizeCompactionConfig(ec.params),
					recovery: normalizeLlmRecoveryPolicy(ec.params),
					steerControl$: steerControl.value$.pipe(
						filter(isSteerControlPayload),
					),
					factory: hostServices?.createChatCompletionStream,
					scriptedTurns: parseScriptedTurns(
						(ec.params as Readonly<Record<string, unknown>>)[
							'scriptedToolTurns'
						],
					),
					nodeId: ec.nodeId,
					skillIds: normalizeSkillIds(ec.params.skillIds),
				} satisfies SubAgentContext;
			},
		);

		const cycle$ = createLlmSessionCycle$(
			context$,
			task.value$,
			(context) => ({
				history: [
					{
						role: 'system',
						content: appendToolInventory(
							context.effectiveSystemPrompt,
							context.tools,
						),
					},
				],
				trackAssistantHistory: true,
				appendUserFeedbackToHistory: false,
				session: undefined,
			}),
			(context, turnPayload, history, _session) => {
				const spawn = acceptSpawn(
					turnPayload,
					context.nodeId,
					context.skillIds,
				);

				if (spawn === null) {
					return EMPTY;
				}

				return runSubAgentTurn(
					context,
					spawn,
					history,
					subagentResult.value$,
				);
			},
			{ primeTurn0: false },
		);

		const reasoning$ = cycle$.pipeValue(
			demuxByKind(
				'reasoning',
				(chunk) =>
					(chunk as Extract<SubAgentChunk, { kind: 'reasoning' }>)
						.text,
			),
		);
		const draftResponse$ = cycle$.pipeValue(
			demuxByKind(
				'draftResponse',
				(chunk) =>
					(chunk as Extract<SubAgentChunk, { kind: 'draftResponse' }>)
						.text,
			),
		);
		const toolLog$ = cycle$.pipeValue(
			demuxByKind(
				'toolLog',
				(chunk) =>
					(chunk as Extract<SubAgentChunk, { kind: 'toolLog' }>).text,
			),
		);
		const recovery$ = cycle$.pipeValue(
			demuxByKind('recoveryNotice', (chunk) => {
				const notice = chunk as Extract<
					SubAgentChunk,
					{ kind: 'recoveryNotice' }
				>;
				return toLlmRecoveryPortValue(notice);
			}),
		);
		const response$ = cycle$.pipeValue(
			demuxByKind(
				'response',
				(chunk) =>
					(chunk as Extract<SubAgentChunk, { kind: 'response' }>)
						.text,
			),
		);
		const result$ = cycle$.pipeValue(
			demuxByKind(
				'subagentResult',
				(chunk) =>
					(
						chunk as Extract<
							SubAgentChunk,
							{ kind: 'subagentResult' }
						>
					).payload,
			),
		);
		const nestedSubagent$ = cycle$.pipeValue(
			demuxByKind(
				'subagentSpawn',
				(chunk) =>
					(chunk as Extract<SubAgentChunk, { kind: 'subagentSpawn' }>)
						.payload,
			),
		);

		return {
			inputs: [systemPrompt, task],
			outputs: [
				configureOutput('registration', registration$, {
					wireType: SUBAGENT_REGISTRATION_WIRE_TYPE,
				}),
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
				configureOutput('result', result$, {
					wireType: SUBAGENT_RESULT_WIRE_TYPE,
					// Protocol payload for parent wiring — not work-log content.
					feed: { role: 'none' },
				}),
			],
			inventoryOutputs: {
				toolLog$,
				recovery$,
				subagent$: nestedSubagent$,
			},
		};
	},
});
