import type {
	ToolHandle,
	configureOutput,
	makeInput,
} from '@langflower/node-sdk';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import type { PermissionAskRequest } from '@langflower/tools/permission';
import type { ChatCompletionMessage } from './chat-completion-stream.js';
import type {
	LlmInventoryInputs,
	SteerControlPayload,
} from '@langflower/node-sdk/llm';
import type { PortMeta } from '@langflower/node-sdk';
import type {
	combineStatefulObservables,
	StatefulObservable,
} from '@rx-evo/stateful-observable';
import {
	filter,
	map,
	pipe,
	shareReplay,
	switchMap,
	type Observable,
	type OperatorFunction,
} from 'rxjs';
import { buildEffectiveSystemPrompt } from './build-effective-system-prompt.js';
import { collectAgentToolHandles } from '../tools/collect-agent-tool-handles.js';
import {
	parseLlmRolePreset,
	resolveEffectiveSkillId,
	type LlmRolePreset,
} from './llm-role-preset.js';
import {
	flattenSubAgentRegistrations,
	type SubAgentRegistration,
	type SubAgentSpawnPayload,
} from './sub-agent-protocol.js';
import type { LlmCompactionConfig } from './openai/normalize-compaction-params.js';
import { normalizeCompactionConfig } from './openai/normalize-compaction-params.js';
import { resolveChatProviderModel } from './resolve-chat-provider-model.js';
import { getRunHostServices } from './run-host-services.js';
import {
	AGENT_MAX_ITERATIONS_CAP,
	DEFAULT_AGENT_MAX_ITERATIONS,
	normalizeMaxIterations as normalizeMaxIterationsParam,
} from './normalize-max-iterations.js';
import type { LlmRecoveryPolicy } from './llm-loop/llm-loop-types.js';
import { normalizeLlmRecoveryPolicy } from './llm-loop/normalize-llm-recovery-policy.js';
import { runLlmSessionMachine } from './llm-session/run-session-machine.js';

/** Shared inventory + panel fields assembled for OpenAI / Fake agent binds. */
export type LlmAgentInventoryContext = {
	readonly prompt: string;
	readonly tools: readonly ToolHandle[];
	readonly subagentRegistrations: readonly SubAgentRegistration[];
	readonly providerId: string;
	readonly model: string;
	readonly skillId: string;
	readonly rolePreset: LlmRolePreset;
	readonly effectiveSystemPrompt: string;
	readonly skillMarkdown: string;
	readonly agentsMarkdown: string;
	readonly toolCtx: ToolHandlerContext;
	readonly maxIterations: number;
	/** Cap on feedback turns after turn 0; 0 = unlimited (Soft↔Hard guardrail). */
	readonly maxFeedbackTurns: number;
	/**
	 * HITL continue asks for storm caps (`agent.maxIterations` /
	 * `agent.maxFeedbackTurns`). Missing → Deny (prior stop behavior).
	 */
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<'allow' | 'deny'>;
	readonly compaction: LlmCompactionConfig;
	readonly recovery: LlmRecoveryPolicy;
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
	| { readonly kind: 'toolLog'; readonly text: string }
	| {
			readonly kind: 'recoveryNotice';
			readonly code: 'retry' | 'suspended';
			readonly text: string;
	  }
	| { readonly kind: 'response'; readonly text: string }
	| {
			readonly kind: 'historySync';
			readonly messages: readonly ChatCompletionMessage[];
	  }
	| {
			readonly kind: 'subagentSpawn';
			readonly payload: SubAgentSpawnPayload;
	  };

type LlmAgentEcSlice = {
	readonly projectDir: string;
	readonly runId: string;
	readonly nodeId: string;
	readonly params: Readonly<Record<string, unknown>>;
	readonly toolHandles?: readonly ToolHandle[];
	readonly mcpHandles?: readonly import('@langflower/node-sdk/mcp').McpHandle[];
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
export const normalizeMaxFeedbackTurns = (value: unknown): number => {
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
 */
const assembleLlmAgentInventoryContext = (
	prompt: unknown,
	toolList: unknown,
	subagentList: unknown,
	mcpList: unknown,
	systemPromptValue: unknown,
	ec: LlmAgentEcSlice,
): LlmAgentInventoryContext => {
	const rolePreset = parseLlmRolePreset(ec.params.rolePreset);
	const skillId = resolveEffectiveSkillId(rolePreset, ec.params.skillId);
	const hostServices = getRunHostServices(ec);
	const skillMarkdown = hostServices?.skillMarkdown ?? '';
	const agentsMarkdown = hostServices?.agentsMarkdown ?? '';

	return {
		prompt: String(prompt ?? ''),
		tools: collectAgentToolHandles({
			toolHandles: ec.toolHandles,
			toolsPort: toolList,
			mcpHandles: ec.mcpHandles,
			mcpPort: mcpList,
		}),
		subagentRegistrations: flattenSubAgentRegistrations(subagentList),
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
		maxIterations: normalizeMaxIterationsParam(ec.params.maxIterations, {
			fallback: DEFAULT_AGENT_MAX_ITERATIONS,
			maxCap: AGENT_MAX_ITERATIONS_CAP,
		}),
		maxFeedbackTurns: normalizeMaxFeedbackTurns(ec.params.maxFeedbackTurns),
		...(hostServices?.requestPermission !== undefined
			? { requestPermission: hostServices.requestPermission }
			: {}),
		compaction: normalizeCompactionConfig(ec.params),
		recovery: normalizeLlmRecoveryPolicy(ec.params),
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
		demuxByKind(
			'toolLog',
			(chunk) => asKind<StandardLlmAgentChunk, 'toolLog'>(chunk).text,
		),
	),
	recovery$: cycle$.pipeValue(
		demuxByKind('recoveryNotice', (chunk) => {
			const notice = asKind<StandardLlmAgentChunk, 'recoveryNotice'>(
				chunk,
			);
			return {
				code: notice.code,
				text: notice.text,
			};
		}),
	),
	response$: cycle$.pipeValue(
		demuxByKind(
			'response',
			(chunk) => asKind<StandardLlmAgentChunk, 'response'>(chunk).text,
		),
	),
	subagent$: cycle$.pipeValue(
		demuxByKind(
			'subagentSpawn',
			(chunk) =>
				asKind<StandardLlmAgentChunk, 'subagentSpawn'>(chunk).payload,
		),
	),
});

/**
 * Shared LLM session cycle (ADR-016): init context recreates the session;
 * turn$ drives turn 0 + later turns with accumulated `messages[]`.
 *
 * All LLM nodes (openai / fake / critique / review / future) MUST use this —
 * do not invent per-node cold-start `switchMap` history.
 */
export const createLlmSessionCycle$ = <
	Context extends {
		readonly maxFeedbackTurns: number;
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
): StatefulObservable<Chunk, Deps, Meta> => {
	const primeTurn0 = options?.primeTurn0 ?? true;

	return context$
		.pipeValue(
			switchMap((context) => {
				const prep = prepareSession(context);
				return runLlmSessionMachine(
					context,
					turn$,
					prep,
					runTurn,
					primeTurn0,
				);
			}),
		)
		.pipe(shareReplay({ bufferSize: 1, refCount: true }));
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
		subagentResult$: Observable<unknown>,
		session: Session,
	) => Observable<Chunk>;
};

/**
 * Composer entry for OpenAI / Fake agent binds.
 *
 * Order:
 * 1. make role inputs (userPrompt / systemPrompt / feedback)
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
	const { tools, mcp, subagentRegistration, subagentResult, steerControl } =
		inventory;

	// 1. role inputs
	const userPrompt = makeInput<string>('userPrompt', {
		name: 'userPrompt',
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
	const feedback = makeInput<string>('feedback', {
		name: 'feedback',
		wireType: 'string',
		multi: 'merge',
		defaultValue: '',
	});

	// 2. inventory context$
	const context$ = combineInputs(
		[userPrompt, tools, subagentRegistration, mcp, systemPrompt, ctx],
		([prompt, toolList, subagentList, mcpList, systemPromptValue, ec]) => {
			const base = assembleLlmAgentInventoryContext(
				prompt,
				toolList,
				subagentList,
				mcpList,
				systemPromptValue,
				ec,
			);
			return {
				...options.extendContext(base, ec),
				steerControl$: steerControl.value$,
			};
		},
	);

	// 3. feedback cycle$ (ADR-016 Soft↔Hard: primeTurn0)
	const cycle$ = createLlmSessionCycle$(
		context$,
		feedback.value$,
		options.prepareSession,
		(context, turnFeedback, history, session) =>
			options.runTurn(
				context,
				turnFeedback === undefined
					? undefined
					: String(turnFeedback ?? ''),
				history,
				subagentResult.value$,
				session,
			),
		{ primeTurn0: true },
	);

	// 4. demux
	const {
		reasoning$,
		draftResponse$,
		toolLog$,
		recovery$,
		response$,
		subagent$,
	} = demuxLlmAgentPorts(cycle$);

	// 5. outputs
	return {
		inputs: [userPrompt, systemPrompt, feedback],
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
		],
		inventoryOutputs: { toolLog$, recovery$, subagent$ },
	};
};
