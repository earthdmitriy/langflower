import type { ToolHandle } from '@langflower/node-sdk';
import {
	isSteerControlContinue,
	isSteerControlPause,
	type SteerControlPayload,
} from '@langflower/node-sdk/llm';
import type { Harness } from '@langflower/tools/create-project-harness';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import type { PermissionAskRequest } from '@langflower/tools/permission';
import {
	EMPTY,
	catchError,
	concat,
	concatMap,
	defer,
	delay,
	expand,
	filter,
	finalize,
	from,
	fromEvent,
	map,
	mergeMap,
	NEVER,
	of,
	race,
	scan,
	switchMap,
	take,
	takeUntil,
	tap,
	throwError,
	TimeoutError,
	timeout,
	type Observable,
} from 'rxjs';
import type {
	ChatCompletionMessage,
	ChatCompletionToolCall,
	ChatCompletionToolDefinition,
	CreateChatCompletionStream,
} from '../chat-completion-stream.js';
import {
	invokeInventoryTool,
	previewToolLogText,
	resolveSpawnPayload,
	SPAWN_SUBAGENT_TOOL,
} from '../../tools/inventory-tool-round.js';
import type {
	SubAgentRegistration,
	SubAgentSpawnPayload,
} from '../sub-agent-protocol.js';
import { prepareChatCompletion } from '../openai/prepare-chat-completion.js';
import type { LlmCompactionConfig } from '../openai/normalize-compaction-params.js';
import {
	compactMessagesWithSummary,
	estimateRequestTokens,
	resolveForceTargetTokens,
} from '../openai/llm-context-compaction.js';
import { classifyLlmFailure } from './classify-llm-failure.js';
import { reduceLlmLoop } from './llm-loop-reducer.js';
import {
	initialLlmLoopState,
	type LlmFailure,
	type LlmLoopState,
	type LlmRecoveryPolicy,
} from './llm-loop-types.js';
import {
	observeProviderStream,
	type ProviderStreamFact,
} from './operators/observe-provider-stream.js';
import { normalizeToolResult } from './operators/normalize-tool-result.js';

export type SharedLlmLoopChunk =
	| { readonly kind: 'reasoning'; readonly text: string }
	| { readonly kind: 'draftResponse'; readonly text: string }
	| { readonly kind: 'toolLog'; readonly text: string }
	| {
			readonly kind: 'recoveryNotice';
			readonly code: 'retry' | 'suspended';
			readonly text: string;
	  }
	| {
			readonly kind: 'historySync';
			readonly messages: readonly ChatCompletionMessage[];
	  }
	| {
			readonly kind: 'subagentSpawn';
			readonly payload: SubAgentSpawnPayload;
	  };

type LlmCompletionDecision<Chunk> =
	| { readonly kind: 'complete'; readonly chunks: readonly Chunk[] }
	| {
			readonly kind: 'run-tools';
			readonly calls: readonly ChatCompletionToolCall[];
	  }
	| {
			readonly kind: 'continue';
			readonly messages: readonly ChatCompletionMessage[];
			readonly chunks: readonly Chunk[];
	  }
	| { readonly kind: 'fail'; readonly failure: LlmFailure };

export type LlmLoopPolicy<Chunk> = {
	readonly decideCompletion: (input: {
		readonly state: LlmLoopState;
		readonly text: string;
		readonly toolCalls: readonly ChatCompletionToolCall[];
	}) => LlmCompletionDecision<Chunk>;
	readonly toolNotAllowedText?: (toolName: string) => string;
	readonly maxIterationsFailure: (
		maxIterations: number,
	) => LlmCompletionDecision<Chunk>;
};

export type RunLlmLoopOptions<Chunk> = {
	readonly factory: CreateChatCompletionStream;
	readonly providerId: string;
	readonly model: string;
	readonly messages: readonly ChatCompletionMessage[];
	readonly chatTools: readonly ChatCompletionToolDefinition[];
	readonly inventoryTools: readonly ToolHandle[];
	readonly harness?: Harness;
	readonly toolCtx?: ToolHandlerContext;
	readonly maxIterations: number;
	readonly compaction: LlmCompactionConfig;
	readonly recovery: LlmRecoveryPolicy;
	readonly policy: LlmLoopPolicy<Chunk>;
	/**
	 * When set, maxIterations exhaustion asks HITL continue instead of
	 * immediately applying {@link LlmLoopPolicy.maxIterationsFailure}.
	 */
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<'allow' | 'deny'>;
	readonly steerControl$?: Observable<SteerControlPayload>;
	readonly subagentRegistrations?: readonly SubAgentRegistration[];
	readonly waitForSubagentResult?: (
		callId: string,
		signal: AbortSignal,
	) => Promise<string>;
};

type LlmLoopPacket<Chunk> =
	| { readonly kind: 'emit'; readonly chunk: Chunk | SharedLlmLoopChunk }
	| { readonly kind: 'transition'; readonly state: LlmLoopState };

const emit = <Chunk>(
	chunk: Chunk | SharedLlmLoopChunk,
): LlmLoopPacket<Chunk> => ({ kind: 'emit', chunk });

const transition = <Chunk>(state: LlmLoopState): LlmLoopPacket<Chunk> => ({
	kind: 'transition',
	state,
});

const failureText = (failure: LlmFailure): string => {
	const status =
		failure.status === undefined ? '' : ` HTTP ${failure.status}`;
	return `Provider failure${status}: ${failure.message}`;
};

const isIncompleteToolCallJson = (
	calls: readonly ChatCompletionToolCall[],
): boolean => {
	for (const call of calls) {
		const args = call.arguments.trim();
		if (args.length === 0) {
			return true;
		}

		try {
			JSON.parse(args);
		} catch {
			return true;
		}
	}

	return false;
};

const isOutputTruncation = (fact: {
	readonly finishReason?: string;
	readonly toolCalls?: readonly ChatCompletionToolCall[];
}): boolean => {
	if (fact.finishReason === 'length') {
		return true;
	}

	const calls = fact.toolCalls ?? [];
	return calls.length > 0 && isIncompleteToolCallJson(calls);
};

const recoveryPackets = <Chunk>(
	state: LlmLoopState,
	failure: LlmFailure,
	options: RunLlmLoopOptions<Chunk>,
): Observable<LlmLoopPacket<Chunk>> => {
	if (!failure.recoverable) {
		return concat(
			of(
				emit<Chunk>({
					kind: 'toolLog',
					text: `⚠ ${failureText(failure)}`,
				}),
			),
			of(
				transition<Chunk>(
					reduceLlmLoop(state, {
						type: 'failure.fatal',
						failure,
					}),
				),
			),
		);
	}

	// Structural history/compaction protocol failures will not heal on retry.
	if (failure.kind === 'protocol') {
		return concat(
			of(
				emit<Chunk>({
					kind: 'recoveryNotice',
					code: 'suspended',
					text: `⚠ ${failureText(failure)}. Paused for Steer or Resume.`,
				}),
			),
			of(
				transition<Chunk>(
					reduceLlmLoop(state, {
						type: 'provider.failed',
						failure,
					}),
				),
			),
		);
	}

	if (state.transientAttempts < options.recovery.maxTransientRetries) {
		const attempt = state.transientAttempts + 1;
		const delayMs =
			failure.retryAfterMs ??
			options.recovery.retryBaseDelayMs * 2 ** (attempt - 1);
		const next = reduceLlmLoop(state, { type: 'retry.scheduled' });

		return concat(
			of(
				emit<Chunk>({
					kind: 'recoveryNotice',
					code: 'retry',
					text: `⚠ ${failureText(failure)}. Retrying ${attempt}/${options.recovery.maxTransientRetries} in ${delayMs}ms.`,
				}),
			),
			of(transition<Chunk>(next)).pipe(delay(delayMs)),
		);
	}

	return concat(
		of(
			emit<Chunk>({
				kind: 'recoveryNotice',
				code: 'suspended',
				text: `⚠ ${failureText(failure)}. Retry budget exhausted; paused for Steer or Resume.`,
			}),
		),
		of(
			transition<Chunk>(
				reduceLlmLoop(state, {
					type: 'provider.failed',
					failure,
				}),
			),
		),
	);
};

const truncationRecoveryPackets = <Chunk>(
	state: LlmLoopState,
	options: RunLlmLoopOptions<Chunk>,
	detail: string,
): Observable<LlmLoopPacket<Chunk>> => {
	const failure: LlmFailure = {
		kind: 'output-truncated',
		message: detail,
		recoverable: true,
	};
	const notice = emit<Chunk>({
		kind: 'recoveryNotice',
		code: 'retry',
		text: `⚠ ${detail}`,
	});

	if (
		options.compaction.contextSize > 0 &&
		state.transientAttempts < options.recovery.maxTransientRetries
	) {
		const attempt = state.transientAttempts + 1;
		const targetTokens = resolveForceTargetTokens(
			options.compaction,
			estimateRequestTokens(state.roundCheckpoint, options.chatTools),
		);

		return concat(
			of(notice),
			defer(() =>
				compactMessagesWithSummary({
					factory: options.factory,
					providerId: options.providerId,
					model: options.model,
					messages: state.roundCheckpoint,
					tools: options.chatTools,
					targetTokens,
				}),
			).pipe(
				catchError((error) =>
					of({
						ok: false as const,
						message: classifyLlmFailure(error).message,
					}),
				),
				mergeMap((compacted) => {
					if (!compacted.ok) {
						return recoveryPackets(
							state,
							{
								...failure,
								message: `${detail} Compaction failed: ${compacted.message}`,
							},
							options,
						);
					}

					const next: LlmLoopState = {
						...state,
						phase: 'prepare',
						committedMessages: [...compacted.messages],
						roundCheckpoint: [...compacted.messages],
						iteration: state.iteration,
						transientAttempts: attempt,
						partial: { reasoning: '', draft: '' },
						pendingToolCalls: [],
						suspendedBy: undefined,
						failure: undefined,
					};

					return from([
						emit<Chunk>({
							kind: 'toolLog',
							text:
								`Compacted history after output truncation ` +
								`(retry ${attempt}/${options.recovery.maxTransientRetries}): ` +
								`~${compacted.beforeTokens} → ~${compacted.afterTokens} approx tokens`,
						}),
						emit<Chunk>({
							kind: 'historySync',
							messages: [...compacted.messages],
						}),
						transition<Chunk>(next),
					]);
				}),
			),
		);
	}

	return recoveryPackets(state, failure, options);
};

type ProviderFrame = {
	readonly state: LlmLoopState;
	readonly fact?: ProviderStreamFact;
};

const providerFactAction = (
	fact: ProviderStreamFact,
): Parameters<typeof reduceLlmLoop>[1] | undefined => {
	switch (fact.kind) {
		case 'provider.reasoning':
			return { type: 'stream.reasoning', text: fact.text };
		case 'provider.draft':
			return { type: 'stream.draft', text: fact.text };
		case 'provider.done':
			if (isOutputTruncation(fact)) {
				return undefined;
			}
			// Policy (`run-tools`) owns the sole assistant+tool_calls commit.
			// Scan must not append here — a double stream.done leaves an orphan
			// incomplete block that breaks later compaction.
			if ((fact.toolCalls?.length ?? 0) > 0) {
				return undefined;
			}
			return {
				type: 'stream.done',
				text: fact.text,
			};
		case 'provider.paused':
			return { type: 'stream.paused' };
		case 'provider.idle':
			return { type: 'stream.idle', idleMs: fact.idleMs };
		case 'provider.failed':
			return undefined;
	}
};

const providerFactPackets = <Chunk>(
	frame: ProviderFrame,
	options: RunLlmLoopOptions<Chunk>,
): Observable<LlmLoopPacket<Chunk>> => {
	const fact = frame.fact;
	if (fact === undefined) {
		return EMPTY;
	}

	switch (fact.kind) {
		case 'provider.reasoning':
			return of(
				emit<Chunk>({
					kind: 'reasoning',
					text: fact.text,
				}),
			);
		case 'provider.draft':
			return of(
				emit<Chunk>({
					kind: 'draftResponse',
					text: fact.text,
				}),
			);
		case 'provider.paused':
			return concat(
				of(
					emit<Chunk>({
						kind: 'toolLog',
						text: 'Paused. Send Steer feedback or Resume to continue.',
					}),
				),
				of(transition<Chunk>(frame.state)),
			);
		case 'provider.idle': {
			const failure: LlmFailure = {
				kind: 'stream-idle',
				message: `Provider stream emitted no chunks for ${fact.idleMs}ms.`,
				recoverable: true,
			};
			const hasPartial =
				frame.state.partial.reasoning.length > 0 ||
				frame.state.partial.draft.length > 0;

			return hasPartial
				? concat(
						of(
							emit<Chunk>({
								kind: 'recoveryNotice',
								code: 'suspended',
								text: `⚠ ${failure.message} Paused to avoid repeating partial work.`,
							}),
						),
						of(transition<Chunk>(frame.state)),
					)
				: recoveryPackets(frame.state, failure, options);
		}
		case 'provider.failed':
			return recoveryPackets(frame.state, fact.failure, options);
		case 'provider.done': {
			if (isOutputTruncation(fact)) {
				const incomplete =
					(fact.toolCalls?.length ?? 0) > 0 &&
					isIncompleteToolCallJson(fact.toolCalls ?? []);
				const reason =
					fact.finishReason === 'length'
						? 'Provider finished with finish_reason=length (output truncated).'
						: 'Provider finished with incomplete tool-call JSON (output truncated).';
				const detail = incomplete
					? `${reason} Incomplete tool arguments will not be executed.`
					: reason;
				return truncationRecoveryPackets(frame.state, options, detail);
			}

			const calls = fact.toolCalls ?? [];
			const decision = options.policy.decideCompletion({
				state: frame.state,
				text:
					fact.text.length > 0
						? fact.text
						: frame.state.partial.draft,
				toolCalls: calls,
			});
			return decisionPackets(frame.state, decision);
		}
	}
};

const decisionPackets = <Chunk>(
	state: LlmLoopState,
	decision: LlmCompletionDecision<Chunk>,
): Observable<LlmLoopPacket<Chunk>> => {
	switch (decision.kind) {
		case 'complete':
			return concat(
				from(decision.chunks).pipe(map((chunk) => emit<Chunk>(chunk))),
				of(
					transition<Chunk>(
						reduceLlmLoop(state, {
							type: 'round.completed',
						}),
					),
				),
			);
		case 'run-tools':
			return of(
				transition<Chunk>(
					reduceLlmLoop(state, {
						type: 'stream.done',
						text: state.partial.draft,
						toolCalls: decision.calls,
					}),
				),
			);
		case 'continue': {
			const next: LlmLoopState = {
				...state,
				phase: 'prepare',
				committedMessages: [...decision.messages],
				roundCheckpoint: [...decision.messages],
				iteration: state.iteration + 1,
				transientAttempts: 0,
				partial: { reasoning: '', draft: '' },
				pendingToolCalls: [],
			};
			return concat(
				from(decision.chunks).pipe(map((chunk) => emit<Chunk>(chunk))),
				of(transition<Chunk>(next)),
			);
		}
		case 'fail':
			return concat(
				of(
					emit<Chunk>({
						kind: 'toolLog',
						text: `⚠ ${decision.failure.message}`,
					}),
				),
				of(
					transition<Chunk>(
						reduceLlmLoop(state, {
							type: 'failure.fatal',
							failure: decision.failure,
						}),
					),
				),
			);
	}
};

const prepareAndStream = <Chunk>(
	state: LlmLoopState,
	options: RunLlmLoopOptions<Chunk>,
	cancel$: Observable<void>,
	cancelSignal: AbortSignal,
): Observable<LlmLoopPacket<Chunk>> => {
	if (options.maxIterations > 0 && state.iteration >= options.maxIterations) {
		const ask = options.requestPermission;
		if (ask === undefined) {
			return decisionPackets(
				state,
				options.policy.maxIterationsFailure(options.maxIterations),
			);
		}

		const waitingText =
			`Tool-loop reached ${options.maxIterations} iterations ` +
			'(maxIterations). Allow to continue for another budget, ' +
			'or Deny to stop.';

		return concat(
			of(emit<Chunk>({ kind: 'toolLog', text: waitingText })),
			from(
				ask({
					toolId: 'agent.maxIterations',
					detail: String(options.maxIterations),
					summary:
						`Tool-loop reached ${options.maxIterations} ` +
						'iterations. Allow to continue?',
				}),
			).pipe(
				switchMap((decision) => {
					if (decision === 'allow') {
						return prepareAndStream(
							{ ...state, iteration: 0 },
							options,
							cancel$,
							cancelSignal,
						);
					}

					return decisionPackets(
						state,
						options.policy.maxIterationsFailure(
							options.maxIterations,
						),
					);
				}),
			),
		);
	}

	return defer(() => {
		const attempt = new AbortController();
		const handleCancel = (): void => attempt.abort();
		cancelSignal.addEventListener('abort', handleCancel, { once: true });

		const preparationSource$ = from(
			prepareChatCompletion({
				factory: options.factory,
				providerId: options.providerId,
				model: options.model,
				messages: state.committedMessages,
				tools: options.chatTools,
				signal: attempt.signal,
				compaction: options.compaction,
			}),
		).pipe(
			map((prepared) => ({ kind: 'prepared', prepared }) as const),
			catchError((error) => of({ kind: 'failed', error } as const)),
		);
		const preparation$ =
			options.recovery.streamIdleTimeoutMs > 0
				? preparationSource$.pipe(
						timeout({
							first: options.recovery.streamIdleTimeoutMs,
							with: () => of({ kind: 'idle' } as const),
						}),
					)
				: preparationSource$;
		const pause$ =
			options.steerControl$ === undefined
				? NEVER
				: options.steerControl$.pipe(
						filter(isSteerControlPause),
						take(1),
						tap(() => attempt.abort()),
						map(() => ({ kind: 'paused' }) as const),
					);

		return race(preparation$, pause$).pipe(
			tap((outcome) => {
				if (outcome.kind === 'idle') {
					attempt.abort();
				}
			}),
			switchMap((prepared) => {
				if (prepared.kind === 'paused') {
					return concat(
						of(
							emit<Chunk>({
								kind: 'toolLog',
								text: 'Paused. Send Steer feedback or Resume to continue.',
							}),
						),
						of(
							transition<Chunk>(
								reduceLlmLoop(state, {
									type: 'stream.paused',
								}),
							),
						),
					);
				}

				if (prepared.kind === 'idle') {
					return recoveryPackets(
						state,
						{
							kind: 'stream-idle',
							message: `Provider stream creation emitted no result for ${options.recovery.streamIdleTimeoutMs}ms.`,
							recoverable: true,
						},
						options,
					);
				}

				if (prepared.kind === 'failed') {
					return recoveryPackets(
						state,
						classifyLlmFailure(prepared.error),
						options,
					);
				}

				const preparedResult = prepared.prepared;
				if (!preparedResult.ok) {
					return recoveryPackets(
						state,
						classifyLlmFailure(preparedResult.error),
						options,
					);
				}

				const preparedState = reduceLlmLoop(state, {
					type: 'round.prepared',
					messages: preparedResult.messages,
				});
				const compactionPackets =
					preparedResult.compaction === undefined
						? EMPTY
						: from([
								emit<Chunk>({
									kind: 'toolLog',
									text: `Compacted history (${preparedResult.compaction.reason}): ~${preparedResult.compaction.beforeTokens} → ~${preparedResult.compaction.afterTokens} approx tokens`,
								}),
								emit<Chunk>({
									kind: 'historySync',
									messages: [...preparedResult.messages],
								}),
							]);
				const pause$ = options.steerControl$ ?? NEVER;
				const streamPackets = observeProviderStream({
					createStream: async () => preparedResult.stream,
					pause$,
					cancel$,
					idleTimeoutMs: options.recovery.streamIdleTimeoutMs,
					onAbort: () => attempt.abort(),
				}).pipe(
					scan<ProviderStreamFact, ProviderFrame>(
						(frame, fact) => {
							const action = providerFactAction(fact);
							return {
								state:
									action === undefined
										? frame.state
										: reduceLlmLoop(frame.state, action),
								fact,
							};
						},
						{ state: preparedState },
					),
					concatMap((frame) => providerFactPackets(frame, options)),
				);

				return concat(compactionPackets, streamPackets);
			}),
			finalize(() => {
				cancelSignal.removeEventListener('abort', handleCancel);
				attempt.abort();
			}),
		);
	});
};

const invokeTool = <Chunk>(
	state: LlmLoopState,
	call: ChatCompletionToolCall,
	options: RunLlmLoopOptions<Chunk>,
	cancelSignal: AbortSignal,
): Observable<LlmLoopPacket<Chunk>> => {
	const callLog = emit<Chunk>({
		kind: 'toolLog',
		text: `→ ${call.name}(${previewToolLogText(call.arguments)})`,
	});

	if (call.name === SPAWN_SUBAGENT_TOOL) {
		const resolved = resolveSpawnPayload(
			call,
			options.subagentRegistrations ?? [],
			state.openSpawnCallId,
		);
		if (!resolved.ok || options.waitForSubagentResult === undefined) {
			const result = !resolved.ok
				? `Error: ${resolved.text}`
				: 'Error: Sub-Agent spawn is not wired (no result wait).';
			return toolResultPackets(state, call, result, options, [callLog]);
		}

		const { payload } = resolved;
		const wait$ = defer(
			() =>
				options.waitForSubagentResult?.(payload.callId, cancelSignal) ??
				Promise.reject(new Error('Sub-Agent wait unavailable')),
		);
		const boundedWait$ =
			options.recovery.subagentTimeoutMs > 0
				? wait$.pipe(
						timeout({
							first: options.recovery.subagentTimeoutMs,
						}),
					)
				: wait$;

		return concat(
			of(
				callLog,
				emit<Chunk>({
					kind: 'subagentSpawn',
					payload,
				}),
				emit<Chunk>({
					kind: 'toolLog',
					text: `… waiting for subagentResult callId=${payload.callId}`,
				}),
			),
			boundedWait$.pipe(
				catchError((error) =>
					of(
						error instanceof TimeoutError
							? `Error: Sub-Agent ${payload.callId} timed out after ${options.recovery.subagentTimeoutMs}ms.`
							: `Error: ${classifyLlmFailure(error).message}`,
					),
				),
				mergeMap((result) =>
					toolResultPackets(state, call, result, options, []),
				),
			),
		);
	}

	const invocation$ = defer(() =>
		invokeInventoryTool(
			options.harness,
			options.inventoryTools,
			call,
			options.toolCtx,
			options.policy.toolNotAllowedText === undefined
				? undefined
				: {
						notInAllowlistText: options.policy.toolNotAllowedText,
					},
		),
	);
	const boundedInvocation$ =
		options.recovery.toolTimeoutMs > 0
			? invocation$.pipe(
					timeout({
						first: options.recovery.toolTimeoutMs,
					}),
				)
			: invocation$;

	return concat(
		of(callLog),
		boundedInvocation$.pipe(
			map((result) =>
				result.ok ? result.text : `Error: ${result.text}`,
			),
			catchError((error) =>
				of(
					error instanceof TimeoutError
						? `Error: Tool ${call.name} timed out after ${options.recovery.toolTimeoutMs}ms.`
						: `Error: ${classifyLlmFailure(error).message}`,
				),
			),
			mergeMap((result) =>
				toolResultPackets(state, call, result, options, []),
			),
		),
	);
};

const toolResultPackets = <Chunk>(
	state: LlmLoopState,
	call: ChatCompletionToolCall,
	result: string,
	options: RunLlmLoopOptions<Chunk>,
	prefix: readonly LlmLoopPacket<Chunk>[],
): Observable<LlmLoopPacket<Chunk>> => {
	const normalized = normalizeToolResult(
		result,
		options.recovery.maxToolResultChars,
	);
	const next = reduceLlmLoop(state, {
		type: 'tool.completed',
		call,
		result: normalized,
	});

	return from([
		...prefix,
		emit<Chunk>({
			kind: 'toolLog',
			text: `← ${call.name}: ${previewToolLogText(normalized)}`,
		}),
		transition<Chunk>(next),
	]);
};

const awaitSteer = <Chunk>(
	state: LlmLoopState,
	options: RunLlmLoopOptions<Chunk>,
	cancel$: Observable<void>,
): Observable<LlmLoopPacket<Chunk>> => {
	if (options.steerControl$ === undefined) {
		const failure =
			state.failure ??
			({
				kind: 'unknown',
				message: 'LLM loop suspended without a steerControl input.',
				recoverable: false,
			} satisfies LlmFailure);
		return of(
			transition<Chunk>(
				reduceLlmLoop(state, {
					type: 'failure.fatal',
					failure,
				}),
			),
		);
	}

	return options.steerControl$.pipe(
		filter(isSteerControlContinue),
		take(1),
		map((payload) =>
			transition<Chunk>(
				reduceLlmLoop(state, {
					type: 'steer.received',
					...(payload.kind === 'steer' &&
					payload.text.trim().length > 0
						? { text: payload.text.trim() }
						: {}),
				}),
			),
		),
		takeUntil(cancel$),
	);
};

const executePhase = <Chunk>(
	state: LlmLoopState,
	options: RunLlmLoopOptions<Chunk>,
	cancel$: Observable<void>,
	cancelSignal: AbortSignal,
): Observable<LlmLoopPacket<Chunk>> => {
	switch (state.phase) {
		case 'prepare':
		case 'streaming':
			return prepareAndStream(state, options, cancel$, cancelSignal);
		case 'tools': {
			const call = state.pendingToolCalls[0];
			return call === undefined
				? of(
						transition<Chunk>({
							...state,
							phase: 'prepare',
							committedMessages: [...state.roundCheckpoint],
							pendingToolCalls: [],
						}),
					)
				: invokeTool(state, call, options, cancelSignal);
		}
		case 'suspended':
			return awaitSteer(state, options, cancel$);
		case 'waiting-subagent':
			return EMPTY;
		case 'failed':
			return throwError(
				() =>
					state.failure?.message ??
					'LLM loop failed without failure details.',
			);
		case 'complete':
		case 'cancelled':
			return EMPTY;
	}
};

/**
 * One reactive state machine for provider, tool, Sub-Agent, retry, and Steer
 * phases. Policy owns only the semantic completion decision.
 */
export const runLlmLoop = <Chunk>(
	options: RunLlmLoopOptions<Chunk>,
): Observable<Chunk | SharedLlmLoopChunk> =>
	defer(() => {
		const cancel = new AbortController();
		const cancel$ = fromEvent(cancel.signal, 'abort').pipe(
			map(() => undefined),
			take(1),
		);

		return of(
			transition<Chunk>(initialLlmLoopState(options.messages)),
		).pipe(
			expand((packet) =>
				packet.kind === 'emit'
					? EMPTY
					: executePhase(
							packet.state,
							options,
							cancel$,
							cancel.signal,
						),
			),
			filter(
				(
					packet,
				): packet is Extract<
					LlmLoopPacket<Chunk>,
					{ readonly kind: 'emit' }
				> => packet.kind === 'emit',
			),
			map((packet) => packet.chunk),
			finalize(() => cancel.abort()),
		);
	});
