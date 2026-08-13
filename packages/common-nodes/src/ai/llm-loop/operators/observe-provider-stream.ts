import type { SteerControlPayload } from '@langflower/node-sdk/llm';
import { isSteerControlPause } from '@langflower/node-sdk/llm';
import {
	catchError,
	concatMap,
	defer,
	endWith,
	filter,
	finalize,
	from,
	map,
	merge,
	of,
	switchMap,
	take,
	takeUntil,
	takeWhile,
	tap,
	timeout,
	type Observable,
} from 'rxjs';
import type {
	ChatCompletionFinishReason,
	ChatCompletionStreamChunk,
	ChatCompletionToolCall,
} from '../../chat-completion-stream.js';
import { classifyLlmFailure } from '../classify-llm-failure.js';
import {
	createDeadLoopDetector,
	type DeadLoopChannel,
	type DeadLoopDetector,
	type DeadLoopDetectorOptions,
} from '../dead-loop-detector.js';
import type { LlmFailure } from '../llm-loop-types.js';

export type ProviderStreamFact =
	| { readonly kind: 'provider.reasoning'; readonly text: string }
	| { readonly kind: 'provider.draft'; readonly text: string }
	| {
			readonly kind: 'provider.done';
			readonly text: string;
			readonly toolCalls?: readonly ChatCompletionToolCall[];
			readonly finishReason?: ChatCompletionFinishReason;
	  }
	| { readonly kind: 'provider.paused' }
	| { readonly kind: 'provider.idle'; readonly idleMs: number }
	| {
			readonly kind: 'provider.dead-loop';
			readonly channel: DeadLoopChannel;
			readonly reason: 'consecutive' | 'cyclic';
	  }
	| { readonly kind: 'provider.failed'; readonly failure: LlmFailure };

export type ObserveProviderStreamOptions = {
	readonly createStream: (
		signal: AbortSignal,
	) => Promise<AsyncIterable<ChatCompletionStreamChunk>>;
	readonly pause$: Observable<SteerControlPayload>;
	readonly cancel$: Observable<void>;
	readonly idleTimeoutMs: number;
	readonly onAbort?: () => void;
	readonly deadLoop?: DeadLoopDetectorOptions | false;
};

const toProviderStreamFact = (
	chunk: ChatCompletionStreamChunk,
): ProviderStreamFact => {
	switch (chunk.kind) {
		case 'reasoning':
			return { kind: 'provider.reasoning', text: chunk.text };
		case 'draft':
			return { kind: 'provider.draft', text: chunk.text };
		case 'done':
			return {
				kind: 'provider.done',
				text: chunk.text,
				...(chunk.tool_calls !== undefined
					? { toolCalls: chunk.tool_calls }
					: {}),
				...(chunk.finishReason !== undefined
					? { finishReason: chunk.finishReason }
					: {}),
			};
	}
};

const isTerminalProviderFact = (fact: ProviderStreamFact): boolean =>
	fact.kind === 'provider.done' ||
	fact.kind === 'provider.paused' ||
	fact.kind === 'provider.idle' ||
	fact.kind === 'provider.dead-loop' ||
	fact.kind === 'provider.failed';

const withIdleTimeout = (
	source$: Observable<ProviderStreamFact>,
	idleTimeoutMs: number,
	onIdle: () => void,
): Observable<ProviderStreamFact> => {
	if (idleTimeoutMs <= 0) {
		return source$;
	}

	return source$.pipe(
		timeout({
			first: idleTimeoutMs,
			each: idleTimeoutMs,
			with: () => {
				onIdle();
				return of({
					kind: 'provider.idle',
					idleMs: idleTimeoutMs,
				} as const);
			},
		}),
	);
};

const guardDeadLoop = (
	fact: ProviderStreamFact,
	detectors:
		| {
				readonly reasoning: DeadLoopDetector;
				readonly draft: DeadLoopDetector;
		  }
		| undefined,
	abort: () => void,
): Observable<ProviderStreamFact> => {
	if (
		detectors === undefined ||
		(fact.kind !== 'provider.reasoning' && fact.kind !== 'provider.draft')
	) {
		return of(fact);
	}

	const channel = fact.kind === 'provider.reasoning' ? 'reasoning' : 'draft';
	const detected = detectors[channel].push(fact.text);
	if (detected.ok) {
		return of(fact);
	}

	abort();
	return of(fact, {
		kind: 'provider.dead-loop' as const,
		channel: detected.error.channel,
		reason: detected.error.reason,
	});
};

/**
 * Convert the provider AsyncIterable into typed, cancellable RxJS facts.
 * Pause, idle, and dead-loop are terminal for one provider attempt, not
 * terminal for the surrounding LLM loop.
 */
export const observeProviderStream = (
	options: ObserveProviderStreamOptions,
): Observable<ProviderStreamFact> =>
	defer(() => {
		const abort = new AbortController();
		const stopProvider = (): void => {
			abort.abort();
			options.onAbort?.();
		};
		const detectors =
			options.deadLoop === false
				? undefined
				: {
						reasoning: createDeadLoopDetector(
							'reasoning',
							options.deadLoop ?? {},
						),
						draft: createDeadLoopDetector(
							'draft',
							options.deadLoop ?? {},
						),
					};
		const pause$ = options.pause$.pipe(
			filter(isSteerControlPause),
			take(1),
			tap(() => {
				stopProvider();
			}),
			map(() => ({ kind: 'provider.paused' }) as const),
		);
		const chunks$ = withIdleTimeout(
			from(options.createStream(abort.signal)).pipe(
				switchMap((stream) => from(stream)),
				concatMap((chunk) =>
					guardDeadLoop(
						toProviderStreamFact(chunk),
						detectors,
						stopProvider,
					),
				),
				catchError((error) =>
					of({
						kind: 'provider.failed',
						failure: classifyLlmFailure(error),
					} as const),
				),
				endWith({
					kind: 'provider.failed',
					failure: {
						kind: 'protocol',
						message:
							'Provider stream completed without a done chunk.',
						recoverable: true,
					},
				} as const),
			),
			options.idleTimeoutMs,
			stopProvider,
		);

		return merge(chunks$, pause$).pipe(
			takeWhile((fact) => !isTerminalProviderFact(fact), true),
			takeUntil(options.cancel$),
			finalize(() => {
				stopProvider();
			}),
		);
	});
