import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../../features/chat-completion-stream.js';
import {
	defineLlmNode,
	isSteerControlPayload,
	toLlmRecoveryPortValue,
} from '@langflower/node-sdk/llm';
import {
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandle,
	type ToolHandlerContext,
} from '@langflower/node-sdk';
import { randomUUID } from 'node:crypto';
import {
	catchError,
	concat,
	filter,
	map,
	mergeMap,
	Observable,
	of,
	Subject,
} from 'rxjs';
import { llmPanelUiSchema } from '../../features/ui-schema/llm-panel-ui-schema.js';
import { llmCompactionUiSchema } from '../../features/ui-schema/llm-compaction-ui-schema.js';
import { llmRecoveryUiSchema } from '../../features/ui-schema/llm-recovery-ui-schema.js';
import {
	AGENT_MAX_ITERATIONS_CAP,
	DEFAULT_AGENT_MAX_ITERATIONS,
	normalizeMaxIterations,
} from '../../features/prompt/normalize-max-iterations.js';
import {
	appendToolInventory,
	createLlmSessionCycle$,
	demuxByKind,
	type LlmAgentInventoryContext,
} from '../../features/llm-session/llm-session-shell.js';
import {
	runAgentLoop,
	type ToolLoopChunk,
} from '../../features/llm-loop/run-agent-loop.js';
import { collectAgentToolHandles } from '../../../tools/collect-agent-tool-handles.js';
import {
	parseLlmRolePreset,
	resolveEffectiveSkillId,
} from '../../features/llm-role-preset.js';
import { resolveChatProviderModel } from '../../features/prompt/resolve-chat-provider-model.js';
import { getRunHostServices } from '../../features/run-host-services.js';
import { buildEffectiveSystemPrompt } from '../../features/prompt/build-effective-system-prompt.js';
import { normalizeCompactionConfig } from '../../features/openai/normalize-compaction-params.js';
import { normalizeLlmRecoveryPolicy } from '../../features/llm-loop/normalize-llm-recovery-policy.js';
import {
	createScriptedFactory,
	parseScriptedTurns,
	type ScriptedTurn,
} from '../../features/scripted-chat-completion-stream.js';

type InvokeTurn = {
	readonly requestId: string;
	readonly task: string;
	readonly skillId: string;
};

type SubAgentChunk =
	| ToolLoopChunk
	| {
			readonly kind: 'invokeDone';
			readonly requestId: string;
			readonly text: string;
	  };

type SubAgentContext = LlmAgentInventoryContext & {
	readonly factory: CreateChatCompletionStream | undefined;
	readonly scriptedTurns: readonly ScriptedTurn[] | undefined;
	readonly nodeId: string;
	readonly displayName: string;
	readonly inspectorDescription: string;
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

const slugToolId = (name: string, nodeId: string): string => {
	const slug = (raw: string): string =>
		raw
			.replace(/[^a-zA-Z0-9_-]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.slice(0, 64);

	const fromName = slug(name.trim());
	if (fromName.length > 0) {
		return fromName;
	}

	const fromNode = slug(nodeId);
	return fromNode.length > 0 ? fromNode : 'subagent';
};

const formatSpawnUserContent = (task: string, skillId: string): string => {
	if (skillId.length === 0) {
		return task;
	}

	return `[skill:${skillId}]\n${task}`;
};

const buildSpecialistDescription = (
	name: string,
	description: string,
	skillIds: readonly string[],
): string => {
	const parts = [`Canvas Sub-Agent «${name}».`];
	if (description.trim().length > 0) {
		parts.push(description.trim());
	}

	if (skillIds.length > 0) {
		parts.push(`Skills: ${skillIds.join(', ')}.`);
	}

	parts.push('Call with a task to run this specialist in-node.');
	return parts.join(' ');
};

const buildSpecialistInputSchema = (skillIds: readonly string[]): object => {
	const properties: Record<string, object> = {
		task: {
			type: 'string',
			description: 'Task for this specialist',
		},
	};

	if (skillIds.length > 0) {
		properties.skillId = {
			type: 'string',
			enum: [...skillIds],
			description:
				'Optional skill announced by this Sub-Agent Inspector selector',
		};
	}

	return {
		type: 'object',
		properties,
		required: ['task'],
	};
};

const resolveTurnFactory = (
	context: SubAgentContext,
): CreateChatCompletionStream | undefined => {
	if (context.scriptedTurns !== undefined) {
		return createScriptedFactory(context.scriptedTurns);
	}

	return context.factory;
};

const chatConfigError = (
	providerId: string,
	model: string,
	scripted: boolean,
): string | undefined => {
	if (scripted) {
		return undefined;
	}

	if (providerId.trim().length === 0) {
		return 'Error: Provider is required for Sub-Agent chat';
	}

	if (model.trim().length === 0) {
		return 'Error: Model is required for Sub-Agent chat';
	}

	return undefined;
};

const runSubAgentTurn = (
	context: SubAgentContext,
	turn: InvokeTurn,
	history: readonly ChatCompletionMessage[],
): Observable<SubAgentChunk> => {
	const fail = (text: string): Observable<SubAgentChunk> =>
		of(
			{ kind: 'response' as const, text },
			{
				kind: 'invokeDone' as const,
				requestId: turn.requestId,
				text,
			},
		);

	const scripted = context.scriptedTurns !== undefined;
	const factory = resolveTurnFactory(context);

	if (factory === undefined) {
		return fail(
			'Error: Sub-Agent chat is only available during server workflow runs',
		);
	}

	const configError = chatConfigError(
		context.providerId,
		context.model,
		scripted,
	);
	if (configError !== undefined) {
		return fail(configError);
	}

	const userContent = formatSpawnUserContent(turn.task, turn.skillId);

	return concat(
		of({
			kind: 'historySync' as const,
			messages: [
				...history,
				{
					role: 'user' as const,
					content: userContent,
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
			messages: [...history, { role: 'user', content: userContent }],
			tools: context.tools,
			toolCtx: context.toolCtx,
			maxIterations: context.maxIterations,
			compaction: context.compaction,
			recovery: context.recovery,
			...(context.requestPermission !== undefined
				? { requestPermission: context.requestPermission }
				: {}),
			...(context.steerControl$ !== undefined
				? { steerControl$: context.steerControl$ }
				: {}),
		}).pipe(
			mergeMap((chunk): Observable<SubAgentChunk> => {
				if (chunk.kind !== 'response') {
					return of(chunk);
				}

				return of(chunk, {
					kind: 'invokeDone' as const,
					requestId: turn.requestId,
					text: chunk.text,
				});
			}),
			catchError((error: unknown) => {
				const text =
					error instanceof Error
						? `Error: ${error.message}`
						: 'Error: Sub-Agent turn failed.';
				return fail(text);
			}),
		),
	);
};

const parseInvokeTurn = (
	raw: unknown,
	skillIds: readonly string[],
):
	| { readonly ok: true; readonly turn: InvokeTurn }
	| { readonly ok: false; readonly text: string } => {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
		return {
			ok: false,
			text: 'Error: Sub-Agent invoke payload is invalid.',
		};
	}

	const record = raw as Readonly<Record<string, unknown>>;
	const requestId =
		typeof record.requestId === 'string' && record.requestId.length > 0
			? record.requestId
			: randomUUID();
	const task = typeof record.task === 'string' ? record.task.trim() : '';
	const skillId =
		typeof record.skillId === 'string' ? record.skillId.trim() : '';

	if (task.length === 0) {
		return {
			ok: false,
			text: 'Error: Sub-Agent requires a non-empty task.',
		};
	}

	if (skillId.length > 0 && !skillIds.includes(skillId)) {
		return {
			ok: false,
			text: `Error: Skill «${skillId}» is not announced by this Sub-Agent.`,
		};
	}

	return { ok: true, turn: { requestId, task, skillId } };
};

/**
 * Sub-Agent: ordinary OpenAI-compatible agent that announces one ToolHandle
 * on `tools`. Parent invoke runs this node's in-node loop.
 * @see docs/ADR.md ADR-021
 */
export const subAgentNode = defineLlmNode({
	type: 'common-sub-agent',
	displayName: 'Sub-Agent',
	category: 'AI',
	description:
		'OpenAI-compatible specialist agent. Wire `tools` into a parent agent; invoke runs this node in-graph.',
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
		const { tools, steerControl } = inventory;
		const systemPrompt = makeInput<string>('systemPrompt', {
			name: 'systemPrompt',
			wireType: 'string',
			inline: 'text-multiline',
			defaultValue: '',
		});

		const invokeTurns$ = new Subject<InvokeTurn>();
		let invokeTail: Promise<void> = Promise.resolve();
		const pending = new Map<
			string,
			{
				readonly resolve: (text: string) => void;
				readonly timer: ReturnType<typeof setTimeout> | undefined;
			}
		>();

		const finishInvoke = (requestId: string, text: string): void => {
			const waiter = pending.get(requestId);
			if (waiter === undefined) {
				return;
			}

			pending.delete(requestId);
			if (waiter.timer !== undefined) {
				clearTimeout(waiter.timer);
			}

			waiter.resolve(text);
		};

		const context$ = combineInputs(
			[systemPrompt, tools, ctx],
			([systemPromptValue, toolList, ec]) => {
				const rolePreset = parseLlmRolePreset(ec.params.rolePreset);
				const skillId = resolveEffectiveSkillId(
					rolePreset,
					ec.params.skillId,
				);
				const hostServices = getRunHostServices(ec);
				const skillMarkdown = hostServices?.skillMarkdown ?? '';
				const agentsMarkdown = hostServices?.agentsMarkdown ?? '';
				const name = String(ec.params.name ?? 'Sub-Agent').trim();
				const inspectorDescription = String(
					ec.params.description ?? '',
				);

				return {
					prompt: '',
					tools: collectAgentToolHandles({
						toolHandles: ec.toolHandles,
						toolsPort: toolList,
					}),
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
					displayName: name.length > 0 ? name : 'Sub-Agent',
					inspectorDescription,
					skillIds: normalizeSkillIds(ec.params.skillIds),
				} satisfies SubAgentContext;
			},
		);

		const cycle$ = createLlmSessionCycle$(
			context$,
			invokeTurns$,
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
			(context, turnPayload, history) => {
				const parsed = parseInvokeTurn(turnPayload, context.skillIds);
				if (!parsed.ok) {
					const requestId =
						turnPayload !== null &&
						typeof turnPayload === 'object' &&
						!Array.isArray(turnPayload) &&
						typeof (turnPayload as { requestId?: unknown })
							.requestId === 'string'
							? (turnPayload as { requestId: string }).requestId
							: '';
					if (requestId.length > 0) {
						finishInvoke(requestId, parsed.text);
					}

					return of(
						{ kind: 'response' as const, text: parsed.text },
						{
							kind: 'invokeDone' as const,
							requestId,
							text: parsed.text,
						},
					);
				}

				return runSubAgentTurn(context, parsed.turn, history).pipe(
					map((chunk) => {
						if (chunk.kind === 'invokeDone') {
							finishInvoke(chunk.requestId, chunk.text);
						}

						return chunk;
					}),
				);
			},
			{ primeTurn0: false },
		);

		const enqueueInvoke = (
			context: SubAgentContext,
			args: Readonly<Record<string, unknown>>,
			_toolCtx: ToolHandlerContext,
		): Promise<string> => {
			const parsed = parseInvokeTurn(
				{ ...args, requestId: randomUUID() },
				context.skillIds,
			);
			if (!parsed.ok) {
				return Promise.resolve(parsed.text);
			}

			const run = (): Promise<string> =>
				new Promise((resolve) => {
					const timeoutMs = context.recovery.subagentTimeoutMs;
					const timer =
						timeoutMs > 0
							? setTimeout(() => {
									pending.delete(parsed.turn.requestId);
									resolve(
										`Error: Sub-Agent timed out after ${timeoutMs}ms.`,
									);
								}, timeoutMs)
							: undefined;
					pending.set(parsed.turn.requestId, { resolve, timer });
					invokeTurns$.next(parsed.turn);
				});

			const next = invokeTail.then(run, run);
			invokeTail = next.then(
				() => undefined,
				() => undefined,
			);
			return next;
		};

		const specialistTools$ = context$.pipeValue(
			map((context): readonly ToolHandle[] => [
				{
					toolId: slugToolId(context.displayName, context.nodeId),
					name: context.displayName,
					description: buildSpecialistDescription(
						context.displayName,
						context.inspectorDescription,
						context.skillIds,
					),
					inputSchema: buildSpecialistInputSchema(context.skillIds),
					invoke: (args, toolCtx) =>
						enqueueInvoke(context, args, toolCtx),
				},
			]),
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

		return {
			inputs: [systemPrompt],
			outputs: [
				configureOutput('subagent-registration', specialistTools$, {
					name: 'subagent-registration',
					wireType: TOOL_HANDLE_WIRE_TYPE,
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
			],
			inventoryOutputs: {
				toolLog$,
				recovery$,
			},
		};
	},
});
