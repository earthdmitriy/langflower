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
	firstValueFrom,
	map,
	mergeMap,
	Observable,
	of,
	Subject,
	switchMap,
	take,
	tap,
	timeout,
	TimeoutError,
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

const formatSpecialistHandleName = (displayName: string): string =>
	`${displayName}(subagent)`;

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
	const parts = [
		`${name} is a canvas Sub-Agent — a separate specialist agent, not a regular tool (not files, shell, or MCP).`,
		'Call this tool to delegate a task; the specialist runs its own model and tools and returns a text result.',
		'Do not try to do this specialist work yourself when this tool is the right owner.',
	];
	if (description.trim().length > 0) {
		parts.push(description.trim());
	}

	if (skillIds.length > 0) {
		parts.push(`Skills: ${skillIds.join(', ')}.`);
	}

	parts.push('Required argument: task — the assignment for this Sub-Agent.');
	return parts.join(' ');
};

const buildSpecialistInputSchema = (skillIds: readonly string[]): object => {
	const properties: Record<string, object> = {
		task: {
			type: 'string',
			description: 'Task to delegate to this Sub-Agent specialist',
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

const EMPTY_INVOKE_RESULT = 'Error: Sub-Agent returned no content';

const finalizeInvokeText = (
	responseText: string,
	lastDraft: string,
	lastReasoning: string,
): string => {
	if (responseText.trim().length > 0) {
		return responseText;
	}

	if (lastDraft.trim().length > 0) {
		return lastDraft;
	}

	if (lastReasoning.trim().length > 0) {
		return lastReasoning;
	}

	return EMPTY_INVOKE_RESULT;
};

const seedInvokeHistory = (
	history: readonly ChatCompletionMessage[],
	context: SubAgentContext,
): readonly ChatCompletionMessage[] => {
	const system: ChatCompletionMessage = {
		role: 'system',
		content: appendToolInventory(
			context.effectiveSystemPrompt,
			context.tools,
		),
	};

	if (history.length === 0) {
		return [system];
	}

	if (history[0]?.role === 'system') {
		return [system, ...history.slice(1)];
	}

	return [system, ...history];
};

const reduceInvokeHistory = (
	history: readonly ChatCompletionMessage[],
	chunk: SubAgentChunk,
): readonly ChatCompletionMessage[] => {
	if (chunk.kind === 'historySync') {
		return [...chunk.messages];
	}

	if (chunk.kind === 'invokeDone' && chunk.text.trim().length > 0) {
		return [...history, { role: 'assistant', content: chunk.text }];
	}

	return history;
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
	let lastDraft = '';
	let lastReasoning = '';

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
				if (chunk.kind === 'reasoning' && chunk.text.length > 0) {
					lastReasoning += chunk.text;
				}

				if (chunk.kind === 'draftResponse' && chunk.text.length > 0) {
					lastDraft += chunk.text;
				}

				if (chunk.kind !== 'response') {
					return of(chunk);
				}

				const text = finalizeInvokeText(
					chunk.text,
					lastDraft,
					lastReasoning,
				);

				return of(
					{ kind: 'response' as const, text },
					{
						kind: 'invokeDone' as const,
						requestId: turn.requestId,
						text,
					},
				);
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
 * on `subagent-registration`. Parent invoke runs this node's in-node loop.
 * @see docs/ADR.md ADR-021
 */
export const subAgentNode = defineLlmNode({
	type: 'common-sub-agent',
	displayName: 'Sub-Agent',
	category: 'AI',
	description: `
A specialist agent on the canvas. Wire it into a parent agent's **tools** so the parent can delegate a task.

The specialist streams in its own work-log card. Set name, role, and skills on this node.
`.trim(),
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

		const chunks$ = new Subject<SubAgentChunk>();
		let latestContext: SubAgentContext | undefined;
		let history: readonly ChatCompletionMessage[] = [];
		let invokeTail: Promise<void> = Promise.resolve();

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

		// Inner chunks stay values. `statefulObservable({ input: chunks$ })`
		// re-emits loading on every token; pipeValue fans it to all demux ports.
		const cycle$ = context$.pipeValue(switchMap(() => chunks$));

		const enqueueInvoke = (
			announced: SubAgentContext,
			args: Readonly<Record<string, unknown>>,
			_toolCtx: ToolHandlerContext,
		): Promise<string> => {
			const context = latestContext ?? announced;
			const parsed = parseInvokeTurn(
				{ ...args, requestId: randomUUID() },
				announced.skillIds,
			);
			if (!parsed.ok) {
				return Promise.resolve(parsed.text);
			}

			const run = (): Promise<string> => {
				history = seedInvokeHistory(history, context);
				const timeoutMs = context.recovery.subagentTimeoutMs;
				let done$ = runSubAgentTurn(context, parsed.turn, history).pipe(
					tap((chunk) => {
						history = reduceInvokeHistory(history, chunk);
						chunks$.next(chunk);
					}),
					filter(
						(
							chunk,
						): chunk is Extract<
							SubAgentChunk,
							{ kind: 'invokeDone' }
						> => chunk.kind === 'invokeDone',
					),
					map((chunk) => chunk.text),
					take(1),
				);

				if (timeoutMs > 0) {
					done$ = done$.pipe(
						timeout({ first: timeoutMs }),
						catchError((error: unknown) =>
							of(
								error instanceof TimeoutError
									? `Error: Sub-Agent timed out after ${timeoutMs}ms.`
									: error instanceof Error
										? `Error: ${error.message}`
										: 'Error: Sub-Agent turn failed.',
							),
						),
					);
				}

				return firstValueFrom(done$, {
					defaultValue: EMPTY_INVOKE_RESULT,
				});
			};

			const next = invokeTail.then(run, run);
			invokeTail = next.then(
				() => undefined,
				() => undefined,
			);
			return next;
		};

		const specialistTools$ = context$.pipeValue(
			tap((context) => {
				latestContext = context;
			}),
			map((context): readonly ToolHandle[] => {
				const handleName = formatSpecialistHandleName(
					context.displayName,
				);
				return [
					{
						toolId: slugToolId(handleName, context.nodeId),
						name: handleName,
						description: buildSpecialistDescription(
							handleName,
							context.inspectorDescription,
							context.skillIds,
						),
						inputSchema: buildSpecialistInputSchema(
							context.skillIds,
						),
						invoke: (args, toolCtx) =>
							enqueueInvoke(context, args, toolCtx),
					},
				];
			}),
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
