import {
	type HitlUploadedFile,
	type NodeStateHook,
	type NodeStateJson,
	type ToolHandle,
	type configureOutput,
	type makeInput,
} from '@langflower/node-sdk';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import type { PermissionAskRequest } from '@langflower/tools/permission';
import {
	isChatCompletionUserTurn,
	type ChatCompletionMessage,
	type ChatCompletionUserTurn,
} from '../chat-completion-stream.js';
import {
	toLlmRecoveryPortValue,
	type LlmInventoryInputs,
	type LlmRecoveryNotice,
	type SteerControlPayload,
} from '@langflower/node-sdk/llm';
import type { PortMeta } from '@langflower/node-sdk';
import { toolLogPortValue } from '../llm-loop/run-llm-loop.js';
import {
	statefulObservable,
	type combineStatefulObservables,
	type StatefulObservable,
} from '@rx-evo/stateful-observable';
import {
	concatMap,
	filter,
	map,
	merge,
	of,
	pipe,
	startWith,
	Subject,
	switchMap,
	tap,
	type Observable,
	type OperatorFunction,
} from 'rxjs';
import { buildEffectiveSystemPrompt } from '../prompt/build-effective-system-prompt.js';
import { collectAgentToolHandles } from '../../../tools/collect-agent-tool-handles.js';
import {
	parseLlmRolePreset,
	resolveEffectiveSkillId,
	type LlmRolePreset,
} from '../llm-role-preset.js';
import type { LlmCompactionConfig } from '../openai/normalize-compaction-params.js';
import { normalizeCompactionConfig } from '../openai/normalize-compaction-params.js';
import { resolveChatProviderModel } from '../prompt/resolve-chat-provider-model.js';
import {
	buildAgentToolCtx,
	type AgentToolCtxCaps,
} from '../../../run-host/run-host-services.js';
import type {
	CapabilityChat,
	PromptSessionContext,
} from '@langflower/node-sdk';
import {
	AGENT_MAX_ITERATIONS_CAP,
	DEFAULT_AGENT_MAX_ITERATIONS,
	normalizeMaxIterations as normalizeMaxIterationsParam,
} from '../prompt/normalize-max-iterations.js';
import type { LlmRecoveryPolicy } from '../llm-loop/llm-loop-types.js';
import { normalizeLlmRecoveryPolicy } from '../llm-loop/normalize-llm-recovery-policy.js';
import {
	normalizeReasoningEffort,
	type ReasoningEffortValue,
} from '../openai/normalize-reasoning-effort.js';
import { LLM_PORT_DESCRIPTIONS } from './llm-port-descriptions.js';
import {
	isBlankTurn,
	runTurnFromState,
	type LlmSessionState,
} from './run-session-machine.js';

/** Shared inventory + panel fields assembled for OpenAI / Fake agent binds. */
export type LlmAgentInventoryContext = {
	readonly prompt: string;
	/**
	 * Turn 0 when `userPrompt` carries a `user-turn`. History stores this object.
	 * Absent on the string `userPrompt` path.
	 */
	readonly openingUserTurn?: ChatCompletionUserTurn;
	readonly tools: readonly ToolHandle[];
	readonly getTools?: () => readonly ToolHandle[];
	readonly providerId: string;
	readonly model: string;
	readonly skillId: string;
	readonly rolePreset: LlmRolePreset;
	readonly effectiveSystemPrompt: string;
	readonly skillMarkdown: string;
	readonly agentsMarkdown: string;
	readonly sessionContext?: PromptSessionContext;
	readonly toolCtx: ToolHandlerContext;
	readonly maxIterations: number;
	/** Cap on feedback turns after turn 0; 0 = unlimited (Soft↔Hard guardrail). */
	readonly maxFeedbackTurns: number;
	/**
	 * HITL continue asks for storm caps (`agent.maxIterations` /
	 * `agent.maxFeedbackTurns`). Missing → Deny (prior stop behavior).
	 */
	readonly requestPermission: (
		request: PermissionAskRequest,
	) => Promise<'allow' | 'deny'>;
	readonly compaction: LlmCompactionConfig;
	readonly recovery: LlmRecoveryPolicy;
	/**
	 * When true, a non-blank turn input replaces the live session with a
	 * fresh prelude before that turn. Panel seed (`ec.params`), captured
	 * when the context is assembled — not read live mid-run.
	 */
	readonly resetSessionOnInput: boolean;
	/**
	 * Chat Completions `reasoning_effort`. Omitted when the inspector is
	 * left on provider default.
	 */
	readonly reasoningEffort?: ReasoningEffortValue;
	/** ADR-032 soft Pause / Steer — set in {@link bindLlmAgentSession}. */
	readonly steerControl$?: Observable<SteerControlPayload>;
};

/**
 * Prep for the shared LLM session cycle (ADR-016). All LLM nodes MUST use
 * {@link createLlmSessionCycle$} — per-node cold-start history is forbidden.
 */
export type LlmFeedbackSessionPrep<Session = undefined> = {
	readonly history: readonly ChatCompletionMessage[];
	/** Append `{ role: assistant, content }` when a `response` chunk arrives. */
	readonly trackAssistantHistory: boolean;
	/** Append turn payload as `{ role: user }` before feedback turns (>0). */
	readonly appendUserFeedbackToHistory: boolean;
	readonly session: Session;
};

export type LlmSessionCycleOptions = {
	/**
	 * When true (default, Soft↔Hard / openai-llm), prime turn 0 with
	 * `startWith('')` and call `runTurn` with `turnPayload === undefined`.
	 * When false (Critique `packet` / Review `result`), the first non-empty
	 * turn$ value is turn 0's payload — no empty prime.
	 */
	readonly primeTurn0?: boolean;
};

/** Standard agent cycle chunk kinds demuxed to OpenAI / Fake ports. */
type StandardLlmAgentChunk =
	| { readonly kind: 'reasoning'; readonly text: string }
	| { readonly kind: 'draftResponse'; readonly text: string }
	| {
			readonly kind: 'toolLog';
			readonly text: string;
			readonly files?: readonly HitlUploadedFile[];
	  }
	| ({ readonly kind: 'recoveryNotice' } & LlmRecoveryNotice)
	| { readonly kind: 'response'; readonly text: string }
	| {
			readonly kind: 'historySync';
			readonly messages: readonly ChatCompletionMessage[];
	  };

export type LlmAgentEcSlice = {
	readonly projectDir: string;
	readonly runId: string;
	readonly nodeId: string;
	readonly params: Readonly<Record<string, unknown>>;
	readonly chat: CapabilityChat;
	readonly toolHandles: readonly ToolHandle[];
	readonly skillMarkdown: string;
	readonly agentsMarkdown: string;
	readonly sessionContext?: PromptSessionContext;
	readonly defaultChat?: {
		readonly providerId: string;
		readonly model: string;
	};
	readonly requestPermission: (
		request: PermissionAskRequest,
	) => Promise<'allow' | 'deny'>;
	readonly getLiveWiredTools: (agentNodeId: string) => readonly ToolHandle[];
	readonly authorize: AgentToolCtxCaps['authorize'];
	readonly denyPaths: readonly string[];
	readonly allowedHosts: readonly string[];
};

const asPortList = (value: unknown): readonly unknown[] => {
	if (value === undefined || value === null) {
		return [];
	}

	return Array.isArray(value) ? value : [value];
};

/**
 * Close over live editor wired tools when the server hook is present;
 * otherwise freeze the combineInputs snapshot (unit tests).
 */
const createAgentGetTools = (
	ec: LlmAgentEcSlice,
	toolList: unknown,
): (() => readonly ToolHandle[]) => {
	return () => {
		const live = ec.getLiveWiredTools(ec.nodeId);
		return collectAgentToolHandles({
			toolHandles: ec.toolHandles,
			toolsPort: [...asPortList(toolList), ...live],
		});
	};
};

type ReactiveBindHelpers = {
	readonly makeInput: typeof makeInput;
	readonly configureOutput: typeof configureOutput;
	readonly combineInputs: typeof combineStatefulObservables;
};

const toolLabel = (tool: ToolHandle): string =>
	tool.name.length > 0 ? tool.name : tool.toolId || 'unknown';

const formatList = <T>(
	items: readonly T[],
	labelOf: (item: T) => string,
): string => (items.length === 0 ? 'none' : items.map(labelOf).join(', '));

/** 0 = unlimited; positive = max feedback turns after turn 0. */
const normalizeMaxFeedbackTurns = (value: unknown): number => {
	const n = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(n) || n < 1) {
		return 0;
	}

	return Math.min(AGENT_MAX_ITERATIONS_CAP, Math.floor(n));
};

export const appendToolInventory = (
	systemPrompt: string,
	tools: readonly ToolHandle[],
): string => {
	if (tools.length === 0) {
		return systemPrompt;
	}

	return [
		systemPrompt,
		`Available tools (callable via internal tool loop): ${formatList(tools, toolLabel)}.`,
	]
		.filter((part) => part.trim().length > 0)
		.join('\n\n');
};

/**
 * Step: merge prompt / inventory / role panel into the shared agent context.
 * OpenAI / Fake / Review / Critique / Sub-Agent must reuse this — do not
 * reassemble host services, `buildAgentToolCtx`, or `getTools` in a node bind.
 */
export const assembleLlmAgentInventoryContext = (
	prompt: unknown,
	toolList: unknown,
	systemPromptValue: unknown,
	ec: LlmAgentEcSlice,
): LlmAgentInventoryContext => {
	const rolePreset = parseLlmRolePreset(ec.params.rolePreset);
	const reasoningEffort = normalizeReasoningEffort(ec.params.reasoningEffort);
	const skillId = resolveEffectiveSkillId(rolePreset, ec.params.skillId);
	const skillMarkdown = ec.skillMarkdown;
	const agentsMarkdown = ec.agentsMarkdown;
	const getTools = createAgentGetTools(ec, toolList);

	return {
		prompt: String(prompt ?? ''),
		tools: getTools(),
		getTools,
		...resolveChatProviderModel(ec.params, ec.defaultChat),
		skillId,
		rolePreset,
		skillMarkdown,
		agentsMarkdown,
		...(ec.sessionContext !== undefined
			? { sessionContext: ec.sessionContext }
			: {}),
		effectiveSystemPrompt: buildEffectiveSystemPrompt({
			rolePreset,
			systemPromptInput: String(systemPromptValue ?? ''),
			agentsMarkdown,
			skillMarkdown,
			...(ec.sessionContext !== undefined
				? { sessionContext: ec.sessionContext }
				: {}),
		}),
		toolCtx: buildAgentToolCtx(
			{ projectDir: ec.projectDir, runId: ec.runId },
			{
				authorize: ec.authorize,
				denyPaths: ec.denyPaths,
				allowedHosts: ec.allowedHosts,
			},
		),
		maxIterations: normalizeMaxIterationsParam(ec.params.maxIterations, {
			fallback: DEFAULT_AGENT_MAX_ITERATIONS,
			maxCap: AGENT_MAX_ITERATIONS_CAP,
		}),
		maxFeedbackTurns: normalizeMaxFeedbackTurns(ec.params.maxFeedbackTurns),
		// Panel params are next-run seeds (`ec.params`). This flag is read
		// when the cycle context is assembled, not live mid-run.
		resetSessionOnInput: ec.params.resetSessionOnInput === true,
		requestPermission: ec.requestPermission,
		compaction: normalizeCompactionConfig(ec.params),
		recovery: normalizeLlmRecoveryPolicy(ec.params),
		...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
	};
};

/**
 * RxJS operator: filter session chunks by `kind` and project the payload.
 * Use inside `pipeValue` — do not wrap as `(cycle$) => cycle$.pipeValue(...)`.
 *
 * `@rx-evo` wraps values in `NoInfer`, which breaks `Extract` type guards —
 * callers narrow with a cast inside `project`.
 */
export const demuxByKind = <Out>(
	kind: string,
	project: (chunk: { readonly kind: string }) => Out,
): OperatorFunction<{ readonly kind: string }, Out> =>
	pipe(
		filter((chunk): boolean => chunk.kind === kind),
		map(project),
	) as OperatorFunction<{ readonly kind: string }, Out>;

const asKind = <
	Chunk extends { readonly kind: string },
	Kind extends string,
>(chunk: {
	readonly kind: string;
}): Extract<Chunk, { kind: Kind }> => chunk as Extract<Chunk, { kind: Kind }>;

const demuxLlmAgentPorts = <Deps, Meta extends PortMeta | undefined>(
	cycle$: StatefulObservable<StandardLlmAgentChunk, Deps, Meta>,
) => ({
	reasoning$: cycle$.pipeValue(
		demuxByKind(
			'reasoning',
			(chunk) => asKind<StandardLlmAgentChunk, 'reasoning'>(chunk).text,
		),
	),
	draftResponse$: cycle$.pipeValue(
		demuxByKind(
			'draftResponse',
			(chunk) =>
				asKind<StandardLlmAgentChunk, 'draftResponse'>(chunk).text,
		),
	),
	toolLog$: cycle$.pipeValue(
		demuxByKind('toolLog', (chunk) =>
			toolLogPortValue(asKind<StandardLlmAgentChunk, 'toolLog'>(chunk)),
		),
	),
	recovery$: cycle$.pipeValue(
		demuxByKind('recoveryNotice', (chunk) => {
			const notice = asKind<StandardLlmAgentChunk, 'recoveryNotice'>(
				chunk,
			);
			return toLlmRecoveryPortValue(notice);
		}),
	),
	response$: cycle$.pipeValue(
		demuxByKind(
			'response',
			(chunk) => asKind<StandardLlmAgentChunk, 'response'>(chunk).text,
		),
	),
});

type JsonObject = { readonly [key: string]: NodeStateJson };

const isJsonObject = (value: NodeStateJson): value is JsonObject =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const readString = (value: NodeStateJson | undefined): string | undefined =>
	typeof value === 'string' ? value : undefined;

const readNonEmpty = (value: NodeStateJson | undefined): string | undefined => {
	const text = readString(value);
	return text !== undefined && text.length > 0 ? text : undefined;
};

const readUploadedFile = (
	value: NodeStateJson,
): HitlUploadedFile | undefined => {
	if (!isJsonObject(value)) {
		return undefined;
	}

	const fileId = readNonEmpty(value['fileId']);
	const name = readNonEmpty(value['name']);
	const mimeType = readNonEmpty(value['mimeType']);
	const size = value['size'];

	if (
		fileId === undefined ||
		name === undefined ||
		mimeType === undefined ||
		typeof size !== 'number' ||
		!Number.isInteger(size) ||
		size < 0
	) {
		return undefined;
	}

	return { fileId, name, mimeType, size };
};

/**
 * Legacy `content: string`, or a user turn `{ text, files }` that cites
 * `HitlUploadedFile` refs. Anything else is dropped.
 */
const readUserContent = (
	value: NodeStateJson | undefined,
): string | ChatCompletionUserTurn | undefined => {
	const text = readString(value);

	if (text !== undefined) {
		return text;
	}

	if (value === undefined || !isJsonObject(value)) {
		return undefined;
	}

	const turnText = readString(value['text']);
	const filesValue = value['files'];

	if (turnText === undefined || !Array.isArray(filesValue)) {
		return undefined;
	}

	const files: HitlUploadedFile[] = [];

	for (const item of filesValue) {
		const file = readUploadedFile(item);

		if (file === undefined) {
			return undefined;
		}

		files.push(file);
	}

	return { text: turnText, files };
};

const readToolCall = (
	value: NodeStateJson,
):
	| { readonly id: string; readonly name: string; readonly arguments: string }
	| undefined => {
	if (!isJsonObject(value)) {
		return undefined;
	}

	const id = readString(value['id']);
	const name = readString(value['name']);
	const args = readString(value['arguments']);
	if (id === undefined || name === undefined || args === undefined) {
		return undefined;
	}

	return { id, name, arguments: args };
};

/**
 * Rebuild a message from JSON fields. Returns undefined when the value is
 * not a chat message — callers must not cast.
 */
const readChatMessage = (
	value: NodeStateJson,
): ChatCompletionMessage | undefined => {
	if (!isJsonObject(value)) {
		return undefined;
	}

	const role = readString(value['role']);
	if (role === undefined) {
		return undefined;
	}

	if (role === 'system') {
		const content = readString(value['content']);
		if (content === undefined) {
			return undefined;
		}

		return { role, content };
	}

	if (role === 'user') {
		const content = readUserContent(value['content']);
		if (content === undefined) {
			return undefined;
		}

		return { role, content };
	}

	const content = readString(value['content']);
	if (content === undefined) {
		return undefined;
	}

	if (role === 'tool') {
		const toolCallId = readString(value['tool_call_id']);
		if (toolCallId === undefined) {
			return undefined;
		}

		return { role: 'tool', content, tool_call_id: toolCallId };
	}

	if (role !== 'assistant') {
		return undefined;
	}

	const toolCallsValue = value['tool_calls'];
	if (toolCallsValue === undefined) {
		return { role: 'assistant', content };
	}

	if (!Array.isArray(toolCallsValue)) {
		return undefined;
	}

	const toolCalls: {
		readonly id: string;
		readonly name: string;
		readonly arguments: string;
	}[] = [];
	for (const item of toolCallsValue) {
		const call = readToolCall(item);
		if (call === undefined) {
			return undefined;
		}

		toolCalls.push(call);
	}

	return { role: 'assistant', content, tool_calls: toolCalls };
};

/**
 * `{ history }` or `{ history, runId }`. Any other shape is refused. `runId` is
 * the run that committed the history; a state saved before it existed has none.
 */
const readPersistedHistory = (
	value: NodeStateJson,
):
	| {
			readonly history: readonly ChatCompletionMessage[];
			readonly runId?: string;
	  }
	| undefined => {
	if (!isJsonObject(value)) {
		return undefined;
	}

	const keys = Object.keys(value);
	const runId = value['runId'];
	if (
		!keys.every((key) => key === 'history' || key === 'runId') ||
		!keys.includes('history') ||
		(runId !== undefined && typeof runId !== 'string')
	) {
		return undefined;
	}

	const history = value['history'];
	if (!Array.isArray(history)) {
		return undefined;
	}

	const messages: ChatCompletionMessage[] = [];
	for (const item of history) {
		const message = readChatMessage(item);
		if (message === undefined) {
			return undefined;
		}

		messages.push(message);
	}

	return typeof runId === 'string'
		? { history: messages, runId }
		: { history: messages };
};

const toolCallToJson = (call: {
	readonly id: string;
	readonly name: string;
	readonly arguments: string;
}): JsonObject => ({
	id: call.id,
	name: call.name,
	arguments: call.arguments,
});

/** Copy a message into an index-signature JSON object (no optional undefined). */
const messageToJson = (message: ChatCompletionMessage): JsonObject => {
	if (message.role === 'tool') {
		return {
			role: message.role,
			content: message.content,
			tool_call_id: message.tool_call_id,
		};
	}

	if (message.role === 'assistant') {
		if (message.tool_calls === undefined) {
			return { role: message.role, content: message.content };
		}

		return {
			role: message.role,
			content: message.content,
			tool_calls: message.tool_calls.map(toolCallToJson),
		};
	}

	if (message.role === 'user' && typeof message.content !== 'string') {
		return {
			role: 'user',
			content: {
				text: message.content.text,
				files: message.content.files.map((file) => ({
					fileId: file.fileId,
					name: file.name,
					mimeType: file.mimeType,
					size: file.size,
				})),
			},
		};
	}

	return { role: message.role, content: message.content };
};

const historyToState = (
	history: readonly ChatCompletionMessage[],
	runId: string | undefined,
): NodeStateJson => ({
	history: history.map(messageToJson),
	...(runId !== undefined ? { runId } : {}),
});

/**
 * Shared LLM session cycle (ADR-016): init context recreates the session;
 * turn$ drives turn 0 + later turns with accumulated `messages[]`.
 *
 * All LLM nodes (openai / fake / critique / review / future) MUST use this —
 * do not invent per-node cold-start `switchMap` history.
 *
 * `state` persists `{ history }` only. `feedbackTurns` and `turn0Done` stay
 * in the cycle closure.
 */
export const createLlmSessionCycle$ = <
	Context extends {
		readonly maxFeedbackTurns: number;
		readonly prompt?: string;
		readonly openingUserTurn?: ChatCompletionUserTurn;
		/** Absent means false. Captured on the assembled context. */
		readonly resetSessionOnInput?: boolean;
		/** The run this context belongs to. A restored agent compares it with the run that saved its history. */
		readonly toolCtx?: { readonly runId: string };
		readonly requestPermission?: (
			request: PermissionAskRequest,
		) => Promise<'allow' | 'deny'>;
	},
	Chunk extends { readonly kind: string },
	Session,
	Deps,
	Meta,
>(
	context$: StatefulObservable<Context, Deps, Meta>,
	turn$: Observable<unknown>,
	prepareSession: (context: Context) => LlmFeedbackSessionPrep<Session>,
	runTurn: (
		context: Context,
		turnPayload: unknown,
		history: readonly ChatCompletionMessage[],
		session: Session,
	) => Observable<Chunk>,
	options?: LlmSessionCycleOptions,
): {
	readonly cycle$: StatefulObservable<Chunk, Deps, Meta>;
	readonly state: NodeStateHook;
} => {
	const primeTurn0 = options?.primeTurn0 ?? true;

	type CycleTick = {
		readonly context: Context;
		readonly prep: LlmFeedbackSessionPrep<Session>;
		readonly raw: unknown;
	};

	const ticks$ = context$.pipeValue(
		switchMap((context) => {
			const prep = prepareSession(context);
			const turns$ = primeTurn0 ? turn$.pipe(startWith('')) : turn$;
			return turns$.pipe(
				map((raw): CycleTick => ({ context, prep, raw })),
			);
		}),
	);

	let state: LlmSessionState<Session, Chunk> | undefined;
	let pendingHistory: readonly ChatCompletionMessage[] | undefined;
	/** The run that committed the restored history. */
	let pendingRunId: string | undefined;
	const persisted$ = new Subject<NodeStateJson>();

	const commitHistory = (
		history: readonly ChatCompletionMessage[],
		runId: string | undefined,
	): void => {
		persisted$.next(historyToState(history, runId));
	};

	const freshSession = (
		prep: LlmFeedbackSessionPrep<Session>,
		turn0Done: boolean,
	): LlmSessionState<Session, Chunk> => ({
		history: [...prep.history],
		turn0Done,
		feedbackTurns: 0,
		preparation: prep,
	});

	const sessionFromPending = (
		prep: LlmFeedbackSessionPrep<Session>,
		context: Context,
		stored: readonly ChatCompletionMessage[],
		resumed: boolean,
	): LlmSessionState<Session, Chunk> => {
		// The run that saved this history is the run being continued: the agent
		// already answered its opening turn before the process ended. Replaying
		// it would append the prompt again and call the model, so it waits for
		// the next turn input instead, like Review and Critique.
		if (!primeTurn0 || resumed) {
			return {
				history: [...stored],
				turn0Done: true,
				feedbackTurns: 0,
				preparation: prep,
			};
		}

		return {
			history: [
				...stored,
				{
					role: 'user',
					content: context.openingUserTurn ?? context.prompt ?? '',
				},
			],
			turn0Done: false,
			feedbackTurns: 0,
			preparation: prep,
		};
	};

	const isSkippableTick = (tick: CycleTick): boolean => {
		const prepChanged =
			state === undefined || state.preparation !== tick.prep;
		if (prepChanged || !state?.turn0Done) {
			return !primeTurn0 && isBlankTurn(tick.raw);
		}

		return isBlankTurn(tick.raw);
	};

	const workTicks$ = ticks$.pipeValue(
		filter((tick) => !isSkippableTick(tick)),
	);

	const restore: NodeStateHook['restore'] = (incoming) => {
		pendingRunId = undefined;
		if (incoming === null) {
			pendingHistory = undefined;
			return { ok: true };
		}

		const persisted = readPersistedHistory(incoming);
		if (persisted === undefined) {
			return {
				ok: false,
				message:
					'Node state must be { history: ChatCompletionMessage[] }',
			};
		}

		pendingHistory = persisted.history;
		pendingRunId = persisted.runId;
		// Drop the live cycle so the next creation is the
		// `state === undefined` branch and consumes this transcript.
		// A later prep change still builds a fresh session.
		state = undefined;
		return { ok: true };
	};

	// pipeValue uses switchMap and would cancel an in-flight turn when the
	// next tick arrives (startWith + a blank BehaviorSubject, or feedback
	// during a stream). Queue turns with concatMap so pending comes from
	// the loader, matching withLoading() + sequential I/O.
	const cycle$ = statefulObservable({
		input: workTicks$.value$,
		mapOperator: concatMap,
		loader: (tick: CycleTick) => {
			const { context, prep, raw } = tick;
			let session = state;
			if (session === undefined) {
				const stored = pendingHistory;
				const savedRunId = pendingRunId;
				pendingHistory = undefined;
				pendingRunId = undefined;
				session =
					stored === undefined
						? freshSession(prep, false)
						: sessionFromPending(
								prep,
								context,
								stored,
								savedRunId !== undefined &&
									savedRunId === context.toolCtx?.runId,
							);
			} else if (session.preparation !== prep) {
				session = freshSession(prep, false);
				commitHistory(session.history, context.toolCtx?.runId);
			}

			if (context.resetSessionOnInput === true && !isBlankTurn(raw)) {
				session = freshSession(prep, primeTurn0);
				commitHistory(session.history, context.toolCtx?.runId);
			}

			state = session;

			return runTurnFromState(
				context,
				session,
				raw,
				primeTurn0,
				runTurn,
			).pipe(
				map((next) => {
					state = next;
					return next;
				}),
				tap({
					complete: () => {
						if (state !== undefined) {
							commitHistory(
								state.history,
								context.toolCtx?.runId,
							);
						}
					},
				}),
				filter(
					(
						next,
					): next is LlmSessionState<Session, Chunk> & {
						readonly emitted: Chunk;
					} => next.emitted !== undefined,
				),
				map((next) => next.emitted),
			);
		},
	}) as StatefulObservable<Chunk, Deps, Meta>;

	return {
		cycle$,
		state: {
			persist$: persisted$.asObservable(),
			restore,
		},
	};
};

type BindLlmAgentSessionOptions<
	Context extends LlmAgentInventoryContext,
	Chunk extends StandardLlmAgentChunk,
	Session,
> = {
	readonly extendContext: (
		base: LlmAgentInventoryContext,
		ec: LlmAgentEcSlice,
	) => Context;
	readonly prepareSession: (
		context: Context,
	) => LlmFeedbackSessionPrep<Session>;
	readonly runTurn: (
		context: Context,
		feedback: string | undefined,
		history: readonly ChatCompletionMessage[],
		session: Session,
	) => Observable<Chunk>;
};

/**
 * Composer entry for OpenAI / Fake agent binds.
 *
 * Order:
 * 1. make role inputs (userPrompt / systemPrompt / feedback; user text may be
 *    a string or a `user-turn`)
 * 2. assemble inventory context$ (+ provider extend)
 * 3. ADR-016 feedback cycle$
 * 4. demux chunk ports
 * 5. configure standard outputs
 */
export const bindLlmAgentSession = <
	Context extends LlmAgentInventoryContext,
	Chunk extends StandardLlmAgentChunk,
	Session = undefined,
>(
	ctx: StatefulObservable<LlmAgentEcSlice, unknown, PortMeta>,
	helpers: ReactiveBindHelpers,
	inventory: LlmInventoryInputs,
	options: BindLlmAgentSessionOptions<Context, Chunk, Session>,
) => {
	const { makeInput, configureOutput, combineInputs } = helpers;
	const { tools, steerControl } = inventory;

	// 1. role inputs
	const userPrompt = makeInput<string | ChatCompletionUserTurn>(
		'userPrompt',
		{
			name: 'userPrompt',
			description:
				'The opening request that starts the session. A plain string, or a user turn with attached files.',
			wireType: ['string', 'user-turn'],
			inline: 'text-multiline',
			required: true,
		},
	);
	const systemPrompt = makeInput<string>('systemPrompt', {
		name: 'systemPrompt',
		description: LLM_PORT_DESCRIPTIONS.systemPrompt,
		wireType: 'string',
		inline: 'text-multiline',
		defaultValue: '',
	});
	const feedback = makeInput<string | ChatCompletionUserTurn>('feedback', {
		name: 'feedback',
		description:
			'Follow-up turns for the same session, such as reviewer notes or chat messages. Values from all wires are accepted as they arrive; each one triggers another model turn that keeps the conversation history.',
		wireType: ['string', 'user-turn'],
		multi: 'merge',
		defaultValue: '',
	});

	// 2. inventory context$
	const inventory$ = combineInputs(
		[tools, systemPrompt, ctx],
		([toolList, systemPromptValue, ec]) => {
			const base = assembleLlmAgentInventoryContext(
				'',
				toolList,
				systemPromptValue,
				ec,
			);
			return {
				...options.extendContext(base, ec),
				steerControl$: steerControl.value$,
			};
		},
	);
	// A string prompt carries no files and is never blank-filtered. A
	// `user-turn` prompt is the opening history message and is dropped when blank.
	const context$ = combineInputs(
		[userPrompt, inventory$],
		([prompt, inventory]) => ({
			...inventory,
			prompt: isChatCompletionUserTurn(prompt)
				? prompt.text
				: String(prompt ?? ''),
			...(isChatCompletionUserTurn(prompt)
				? { openingUserTurn: prompt }
				: {}),
		}),
	).pipeValue(
		filter(
			(context) =>
				context.openingUserTurn === undefined ||
				!isBlankTurn(context.openingUserTurn),
		),
	);

	// 3. feedback cycle$ (ADR-016 Soft↔Hard: primeTurn0)
	// `userPrompt` opens the session via context; `feedback` carries later
	// turns, string or `user-turn`. Do not use `withLatestFrom`.
	const { cycle$, state } = createLlmSessionCycle$(
		context$,
		feedback.value$,
		options.prepareSession,
		(context, turnPayload, history, session) =>
			options.runTurn(
				context,
				turnPayload === undefined
					? undefined
					: isChatCompletionUserTurn(turnPayload)
						? turnPayload.text
						: String(turnPayload ?? ''),
				history,
				session,
			),
		{ primeTurn0: true },
	);

	// 4. demux
	const { reasoning$, draftResponse$, toolLog$, recovery$, response$ } =
		demuxLlmAgentPorts(cycle$);

	// 5. outputs
	return {
		inputs: [userPrompt, systemPrompt, feedback],
		outputs: [
			configureOutput('reasoning', reasoning$, {
				description: LLM_PORT_DESCRIPTIONS.reasoning,
				wireType: 'string',
				feed: { role: 'reasoning', streaming: true },
			}),
			configureOutput('draftResponse', draftResponse$, {
				description: LLM_PORT_DESCRIPTIONS.draftResponse,
				wireType: 'string',
				feed: { role: 'draft', streaming: true },
			}),
			configureOutput('response', response$, {
				description: LLM_PORT_DESCRIPTIONS.response,
				wireType: 'string',
				feed: { role: 'result' },
			}),
		],
		inventoryOutputs: { toolLog$, recovery$ },
		state,
	};
};
