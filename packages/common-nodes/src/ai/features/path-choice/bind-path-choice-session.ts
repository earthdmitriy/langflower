import type {
	configureOutput,
	makeInput,
	PortMeta,
} from '@langflower/node-sdk';
import {
	isSteerControlPayload,
	toLlmRecoveryPortValue,
	type LlmInventoryInputs,
} from '@langflower/node-sdk/llm';
import {
	type combineStatefulObservables,
	type StatefulObservable,
} from '@rx-evo/stateful-observable';
import { filter, map, Observable } from 'rxjs';
import type {
	ChatCompletionMessage,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import {
	assembleLlmAgentInventoryContext,
	createLlmSessionCycle$,
	demuxByKind,
	type LlmAgentEcSlice,
	type LlmAgentInventoryContext,
} from '../llm-session/llm-session-shell.js';
import {
	DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
	PATH_CHOICE_MAX_ITERATIONS_CAP,
	normalizeMaxIterations,
} from '../prompt/normalize-max-iterations.js';
import {
	runPathChoiceToolLoop,
	type ReviewLoopChunk,
} from './run-reactive-path-choice-loop.js';

type PathChoiceChunk =
	| Exclude<ReviewLoopChunk, { kind: 'accept' }>
	| {
			readonly kind: 'accept';
			readonly notes: string;
			readonly result: string;
	  };

type PathChoiceContext = LlmAgentInventoryContext & {
	readonly factory: CreateChatCompletionStream;
};

type ReactiveBindHelpers = {
	readonly makeInput: typeof makeInput;
	readonly configureOutput: typeof configureOutput;
	readonly combineInputs: typeof combineStatefulObservables;
};

type BindPathChoiceSessionOptions = {
	readonly primary: {
		readonly id: string;
		readonly name: string;
	};
	readonly turn: {
		readonly id: string;
		readonly name: string;
	};
	readonly forcedSystem: string;
	readonly requireProviderError: string;
	readonly requireModelError: string;
	readonly buildUserContent: (primary: string, turn: string) => string;
	readonly buildRevisedUserContent: (turn: string) => string;
};

const prependForcedSystem = (forced: string, merged: string): string => {
	const parts = [forced];
	if (merged.trim().length > 0) {
		parts.push(merged);
	}

	return parts.join('\n\n---\n\n');
};

const hasUserMessage = (history: readonly ChatCompletionMessage[]): boolean =>
	history.some((message) => message.role === 'user');

const requireChatConfig = (
	providerId: string,
	model: string,
	options: BindPathChoiceSessionOptions,
): void => {
	if (providerId.trim().length === 0) {
		throw new Error(options.requireProviderError);
	}

	if (model.trim().length === 0) {
		throw new Error(options.requireModelError);
	}
};

const runPathChoiceTurn = (
	context: PathChoiceContext,
	turn: string,
	history: readonly ChatCompletionMessage[],
	options: BindPathChoiceSessionOptions,
): Observable<PathChoiceChunk> => {
	const factory = context.factory;

	requireChatConfig(context.providerId, context.model, options);

	const userContent = hasUserMessage(history)
		? options.buildRevisedUserContent(turn)
		: options.buildUserContent(context.prompt, turn);

	return runPathChoiceToolLoop({
		factory,
		providerId: context.providerId,
		model: context.model,
		messages: [...history, { role: 'user', content: userContent }],
		maxIterations: context.maxIterations,
		tools: context.tools,
		...(context.getTools !== undefined
			? { getTools: context.getTools }
			: {}),
		compaction: context.compaction,
		recovery: context.recovery,
		...(context.steerControl$ !== undefined
			? { steerControl$: context.steerControl$ }
			: {}),
		toolCtx: context.toolCtx,
	}).pipe(
		map((chunk): PathChoiceChunk => {
			if (chunk.kind === 'accept') {
				return {
					kind: 'accept',
					notes: chunk.notes,
					result: turn,
				};
			}

			return chunk;
		}),
	);
};

/**
 * Composer entry for Review / Critique binds.
 *
 * Order:
 * 1. make primary / turn / systemPrompt inputs
 * 2. assemble inventory context$ (path-choice maxIterations + forced system)
 * 3. ADR-016 cycle$ (`primeTurn0: false`; turn driver = second input)
 * 4. demux chunk ports including accept → response and feedback
 * 5. configure outputs
 */
export const bindPathChoiceSession = (
	ctx: StatefulObservable<LlmAgentEcSlice, unknown, PortMeta>,
	helpers: ReactiveBindHelpers,
	inventory: LlmInventoryInputs,
	options: BindPathChoiceSessionOptions,
) => {
	const { makeInput, configureOutput, combineInputs } = helpers;
	const { tools, steerControl } = inventory;

	const primary = makeInput<string>(options.primary.id, {
		name: options.primary.name,
		wireType: 'string',
		inline: 'text-multiline',
		required: true,
	});
	const turn = makeInput<string>(options.turn.id, {
		name: options.turn.name,
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

	const context$ = combineInputs(
		[primary, systemPrompt, tools, ctx],
		([primaryValue, systemPromptValue, toolList, ec]) => {
			const base = assembleLlmAgentInventoryContext(
				primaryValue,
				toolList,
				systemPromptValue,
				ec,
			);

			return {
				...base,
				effectiveSystemPrompt: prependForcedSystem(
					options.forcedSystem,
					base.effectiveSystemPrompt,
				),
				factory: ec.chat,
				maxIterations: normalizeMaxIterations(ec.params.maxIterations, {
					fallback: DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
					maxCap: PATH_CHOICE_MAX_ITERATIONS_CAP,
				}),
				steerControl$: steerControl.value$.pipe(
					filter(isSteerControlPayload),
				),
			} satisfies PathChoiceContext;
		},
	);

	const cycle$ = createLlmSessionCycle$(
		context$,
		turn.value$,
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
			runPathChoiceTurn(
				context,
				String(turnPayload ?? ''),
				history,
				options,
			),
		{ primeTurn0: false },
	);

	const reasoning$ = cycle$.pipeValue(
		demuxByKind(
			'reasoning',
			(chunk) =>
				(chunk as Extract<PathChoiceChunk, { kind: 'reasoning' }>).text,
		),
	);
	const draftResponse$ = cycle$.pipeValue(
		demuxByKind(
			'draftResponse',
			(chunk) =>
				(chunk as Extract<PathChoiceChunk, { kind: 'draftResponse' }>)
					.text,
		),
	);
	const toolLog$ = cycle$.pipeValue(
		demuxByKind(
			'toolLog',
			(chunk) =>
				(chunk as Extract<PathChoiceChunk, { kind: 'toolLog' }>).text,
		),
	);
	const recovery$ = cycle$.pipeValue(
		demuxByKind('recoveryNotice', (chunk) => {
			const notice = chunk as Extract<
				PathChoiceChunk,
				{ kind: 'recoveryNotice' }
			>;
			return toLlmRecoveryPortValue(notice);
		}),
	);
	const response$ = cycle$.pipeValue(
		demuxByKind(
			'accept',
			(chunk) =>
				(chunk as Extract<PathChoiceChunk, { kind: 'accept' }>).result,
		),
	);
	const feedback$ = cycle$.pipeValue(
		demuxByKind(
			'feedback',
			(chunk) =>
				(chunk as Extract<PathChoiceChunk, { kind: 'feedback' }>).notes,
		),
	);

	return {
		inputs: [primary, turn, systemPrompt],
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
};
