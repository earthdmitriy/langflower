import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../../features/chat-completion-stream.js';
import { concat, interval, map, of, take, type Observable } from 'rxjs';
import { defineLlmNode } from '@langflower/node-sdk/llm';
import { llmPanelUiSchema } from '../../features/ui-schema/llm-panel-ui-schema.js';
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
import { DISABLED_COMPACTION_CONFIG } from '../../features/openai/normalize-compaction-params.js';
import type { ToolHandle } from '@langflower/node-sdk';
import { waitForSubagentResult } from '../../features/wait-for-subagent-result.js';
import {
	createScriptedFactory,
	parseScriptedTurns,
	type ScriptedTurn,
} from '../../features/scripted-chat-completion-stream.js';
import { getRunHostServices } from '../../features/run-host-services.js';

type FakeLlmChunk =
	{ readonly kind: 'reasoning'; readonly text: string } | ToolLoopChunk;

type FakeLlmContext = LlmAgentInventoryContext & {
	readonly tokenDelayMs: number;
	readonly scriptedTurns: readonly ScriptedTurn[] | undefined;
	readonly completionFactory: CreateChatCompletionStream | undefined;
};

type FakeLlmBundle = FakeLlmContext & {
	readonly feedback: string;
};

/**
 * Default pacing for manual demos. Each sentence-sized chunk is emitted at
 * this delay so the final response follows a visible stream promptly.
 */
const DEFAULT_TOKEN_DELAY_MS = 40;

const tokenize = (text: string): readonly string[] => {
	if (text.length === 0) {
		return [''];
	}

	return text.match(/[^.!?]+[.!?]+(?:\s+|$)|\S+\s*/g) ?? [text];
};

const toolLabel = (tool: ToolHandle): string =>
	tool.name.length > 0 ? tool.name : tool.toolId || 'unknown';

const formatList = <T>(
	items: readonly T[],
	labelOf: (item: T) => string,
): string => (items.length === 0 ? 'none' : items.map(labelOf).join(', '));

const summarizeSystemPrompt = (text: string): string => {
	const trimmed = text.trim();

	if (trimmed.length === 0) {
		return '(empty)';
	}

	if (trimmed.length <= 120) {
		return trimmed;
	}

	return `${trimmed.slice(0, 117)}…`;
};

const buildReasoning = (bundle: FakeLlmBundle): string => {
	const toolList = formatList(bundle.tools, toolLabel);
	const providerLabel =
		bundle.providerId.length > 0 ? bundle.providerId : 'unset';
	const modelLabel = bundle.model.length > 0 ? bundle.model : 'unset';
	const skillLabel = bundle.skillId.length > 0 ? bundle.skillId : 'none';
	const skillBodyNote =
		bundle.skillMarkdown.trim().length > 0
			? `Loaded skill markdown: ${summarizeSystemPrompt(bundle.skillMarkdown)}.`
			: 'No skill markdown loaded for this cycle.';
	const agentsBodyNote =
		bundle.agentsMarkdown.trim().length > 0
			? `Loaded root AGENTS.md: ${summarizeSystemPrompt(bundle.agentsMarkdown)}.`
			: 'No root AGENTS.md loaded for this cycle.';

	return [
		`User asked to «${bundle.prompt}». Let me unpack what they actually need before I commit to an answer.`,
		`Instance config: provider=${providerLabel}, model=${modelLabel}, skill=${skillLabel}, preset=${bundle.rolePreset}.`,
		skillBodyNote,
		agentsBodyNote,
		`Effective system prompt: ${summarizeSystemPrompt(bundle.effectiveSystemPrompt)}.`,
		`First pass: is this a research task, a coding change, a planning exercise, or a direct factual question? The wording could fit more than one lane, so I should not rush into tool calls or a one-shot reply.`,
		`Second pass: what constraints are implied? Tone, length, audience, and whether they want steps versus a finished artifact. If the prompt is short, I still need to invent a reasonable interpretation and state it clearly in the draft.`,
		`Third pass: do I need tools, or can I answer from general knowledge? Available tools: ${toolList}. If tools are listed, I should mention which ones I would reach for and why; if none, I should say I am answering without tool use.`,
		`Hypothesis A: treat it as a research / exploration request. Then I would outline sources, open questions, and a short investigation plan before writing anything polished.`,
		`Hypothesis B: treat it as an implementation or editing request. Then I would clarify the target files or deliverable, list risks, and propose a minimal change set.`,
		`Hypothesis C: treat it as a brainstorm. Then I would fan out a few options, compare trade-offs, and recommend one default path with an escape hatch.`,
		`I keep oscillating between A and C when the prompt is abstract, and between A and B when it mentions concrete nouns. For now I will assume a mixed approach: reason carefully, then produce a substantial draft that could stand alone if the user never follows up.`,
		`Checklist before drafting: restated goal, assumptions, risks, next actions, and a closing summary that mirrors the original ask. I will also leave room to incorporate feedback if a later revision arrives.`,
		`Still thinking: is there ambiguity around success criteria? Yes. I will define a provisional success bar in the draft so the user can correct it. Is there a chance they wanted only a short answer? Possible, but a longer structured draft is safer for demo and review flows.`,
		`Tooling note again for the trace: tools=[${toolList}]; preset=${bundle.rolePreset}; skill=${skillLabel}. Even if I do not invoke them in this fake run, listing them here proves the wiring reached the model context.`,
		`Alright — enough deliberation. I will write a full draft response next, then emit a concise final answer that captures the same conclusion.`,
	].join(' ');
};

const buildDraft = (prompt: string, feedback: string): string => {
	if (feedback !== '') {
		return [
			`Draft (revised with feedback).`,
			`The user previously replied with: «${feedback}».`,
			`I am folding that feedback into a fuller rewrite rather than a tiny patch, so the draft stays readable as a standalone document.`,
			`Updated interpretation of the original ask «${prompt}»: keep the core intent, but prioritize the feedback notes above any earlier assumptions that conflict.`,
			`Section 1 — Restated goal. Explain what we are optimizing for after feedback, including what we will not do.`,
			`Section 2 — Approach. Describe the plan in ordered steps, call out dependencies, and mention where a tool or MCP server would help if this were a real agent run.`,
			`Section 3 — Detailed answer. Expand into multiple paragraphs with concrete recommendations, examples, and edge cases. Prefer clarity over cleverness.`,
			`Section 4 — Risks and open questions. List what still needs confirmation from the user before treating the work as finished.`,
			`Section 5 — Next actions. Give a short checklist the user (or a downstream agent) can execute immediately.`,
			`Closing: this revised draft should feel like a careful human editor passed over the first version, not like a brittle string replace on a few tokens.`,
		].join(' ');
	}

	return [
		`Draft response for: «${prompt}».`,
		`Opening. Thanks for the request — here is a structured draft you can skim or wire into a review gate.`,
		`Restated goal. I am treating your prompt as the primary success criterion. If I guessed the wrong lane (research vs implement vs brainstorm), say so and I will revise.`,
		`Assumptions. (1) You want a useful standalone answer, not a one-line ack. (2) Extra structure is welcome for demos and HITL review. (3) Tool and MCP availability may be empty in this fake run, but the draft should still read like an agent that considered them.`,
		`Approach. Step one: clarify the ask in plain language. Step two: outline options. Step three: recommend a default path. Step four: list verification steps. Step five: summarize.`,
		`Option analysis. Option A is the smallest viable answer — fast, but easy to under-specify. Option B is a deeper treatment with examples and trade-offs — slower to read, better for review. Option C is a speculative expansion that may overfit. I recommend Option B as the default.`,
		`Main body. Expand the recommended option into several paragraphs. Cover motivation, the proposed solution shape, how you would validate it, and what you would do if the first attempt fails. Keep the language concrete enough that a teammate could act without re-asking the same question.`,
		`Worked sketch. Imagine applying the answer to a small Langflower workflow: prompt node into an agent-like node, optional tool registrations on the side, then preview or review. Call out where streaming reasoning and draft tokens help a human follow along.`,
		`Edge cases. Empty tool lists, contradictory feedback, overly broad prompts, and prompts that mix research with coding. For each, prefer asking a focused clarifying question over inventing irreversible steps.`,
		`Quality bar. The draft is good enough when a reviewer can accept it, reject it with notes, or forward it downstream without rewriting from scratch.`,
		`Closing paragraph. I will now emit a shorter final response that freezes the recommendation while leaving the longer draft available on the draftResponse stream for the feed UI.`,
	].join(' ');
};

const buildResponse = (prompt: string, feedback: string): string =>
	feedback !== ''
		? `Final: Revised answer for «${prompt}» after feedback «${feedback}». See the draft stream for the full structured rewrite; this final line is the accepted summary.`
		: `Final: Answer for «${prompt}». See the draft stream for the full structured write-up; this final line is the accepted summary.`;

const runFakeImitateCycle = (
	bundle: FakeLlmBundle,
): Observable<FakeLlmChunk> => {
	const delayMs = Math.max(0, bundle.tokenDelayMs);
	const chunks = [
		...tokenize(buildReasoning(bundle)).map(
			(text) =>
				({ kind: 'reasoning' as const, text }) satisfies FakeLlmChunk,
		),
		...tokenize(buildDraft(bundle.prompt, bundle.feedback)).map(
			(text) =>
				({
					kind: 'draftResponse' as const,
					text,
				}) satisfies FakeLlmChunk,
		),
		{
			kind: 'response' as const,
			text: buildResponse(bundle.prompt, bundle.feedback),
		} satisfies FakeLlmChunk,
	] as const;

	return interval(delayMs).pipe(
		take(chunks.length),
		map((index) => chunks[index]!),
	);
};

const runFakeToolLoopCycle = (
	bundle: FakeLlmBundle,
	messages: readonly ChatCompletionMessage[],
	factory: CreateChatCompletionStream,
	subagentResult$: Observable<unknown>,
): Observable<FakeLlmChunk> => {
	return runAgentLoop({
		factory,
		providerId: bundle.providerId.length > 0 ? bundle.providerId : 'fake',
		model: bundle.model.length > 0 ? bundle.model : 'fake',
		messages: [...messages],
		tools: bundle.tools,
		toolCtx: bundle.toolCtx,
		maxIterations: bundle.maxIterations,
		compaction: DISABLED_COMPACTION_CONFIG,
		recovery: bundle.recovery,
		subagentRegistrations: bundle.subagentRegistrations,
		...(bundle.requestPermission !== undefined
			? { requestPermission: bundle.requestPermission }
			: {}),
		...(bundle.steerControl$ !== undefined
			? { steerControl$: bundle.steerControl$ }
			: {}),
		...(bundle.subagentRegistrations.length > 0
			? {
					waitForSubagentResult: (callId, signal) =>
						waitForSubagentResult(subagentResult$, callId, signal),
				}
			: {}),
	}) as Observable<ToolLoopChunk>;
};

const resolveSessionFactory = (
	context: FakeLlmContext,
): CreateChatCompletionStream | undefined =>
	// Scripted turns own the loop when present (do not prefer a server-bound
	// OpenAI factory over the script). Injected EC factory is for unit tests
	// only — server omits createChatCompletionStream for this node type.
	context.scriptedTurns !== undefined
		? createScriptedFactory(context.scriptedTurns)
		: context.completionFactory;

/**
 * Deterministic LLM stand-in for demos / feed UX. Supports an optional
 * scripted tool-loop (`scriptedToolTurns` or injected `createChatCompletionStream`)
 * that invokes `ctx.harness` like openai-llm.
 * @see docs/ADR.md ADR-016
 */
export const fakeLlmNode = defineLlmNode({
	type: 'common-fake-llm',
	displayName: 'Fake LLM',
	category: 'AI',
	description:
		'Imitates an LLM for demos: streams **reasoning** and **draftResponse**, then **response**. Optional scripted tool loop invokes `ctx.harness`.',
	uiSchema: [
		...llmPanelUiSchema,
		...llmRecoveryUiSchema,
		{
			field: 'tokenDelayMs',
			type: 'number',
			label: 'Token delay (ms)',
			default: DEFAULT_TOKEN_DELAY_MS,
			min: 0,
			step: 1,
		},
	] as const,
	bind(ctx, helpers, inventory) {
		return bindLlmAgentSession<
			FakeLlmContext,
			FakeLlmChunk,
			CreateChatCompletionStream | undefined
		>(ctx, helpers, inventory, {
			extendContext: (base, ec) => ({
				...base,
				tokenDelayMs: Math.max(
					0,
					Number(ec.params.tokenDelayMs ?? DEFAULT_TOKEN_DELAY_MS),
				),
				scriptedTurns: parseScriptedTurns(
					ec.params['scriptedToolTurns'],
				),
				completionFactory:
					getRunHostServices(ec)?.createChatCompletionStream,
			}),
			prepareSession: (context) => {
				const useToolLoop =
					context.scriptedTurns !== undefined ||
					context.completionFactory !== undefined;
				const systemWithTools = appendToolInventory(
					context.effectiveSystemPrompt,
					context.tools,
				);

				return {
					history: useToolLoop
						? [
								{
									role: 'system',
									content: systemWithTools,
								},
								{ role: 'user', content: context.prompt },
							]
						: [],
					trackAssistantHistory: useToolLoop,
					appendUserFeedbackToHistory: useToolLoop,
					// Session-scoped factory so scripted cursor advances across
					// feedback turns (mirrors prior switchMap closure).
					session: resolveSessionFactory(context),
				};
			},
			runTurn: (
				context,
				feedback,
				history,
				subagentResult$,
				sessionFactory,
			) => {
				const bundle = {
					...context,
					feedback: feedback ?? '',
				} satisfies FakeLlmBundle;

				if (sessionFactory !== undefined) {
					return runFakeToolLoopCycle(
						bundle,
						history,
						sessionFactory,
						subagentResult$,
					);
				}

				return runFakeImitateCycle(bundle);
			},
		});
	},
});
