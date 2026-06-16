import type { SteerControlPayload } from '@langflower/node-sdk/llm';
import { isSteerControlPause } from '@langflower/node-sdk/llm';
import {
	catchError,
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
	| { readonly kind: 'provider.failed'; readonly failure: LlmFailure };

export type ObserveProviderStreamOptions = {
	readonly createStream: (
		signal: AbortSignal,
	) => Promise<AsyncIterable<ChatCompletionStreamChunk>>;
	readonly pause$: Observable<SteerControlPayload>;
	readonly cancel$: Observable<void>;
	readonly idleTimeoutMs: number;
	readonly onAbort?: () => void;
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
	fact.kind === 'provider.failed';

const withIdleTimeout = (
	source$: Observable<ProviderStreamFact>,
	idleTimeoutMs: number,
): Observable<ProviderStreamFact> => {
	if (idleTimeoutMs <= 0) {
		return source$;
	}

	return source$.pipe(
		timeout({
			first: idleTimeoutMs,
			each: idleTimeoutMs,
			with: () =>
				of({
					kind: 'provider.idle',
					idleMs: idleTimeoutMs,
				} as const),
		}),
	);
};

/**
 * Convert the provider AsyncIterable into typed, cancellable RxJS facts.
 * Pause and idle are terminal for one provider attempt, not terminal for the
 * surrounding LLM loop.
 */
export const observeProviderStream = (
	options: ObserveProviderStreamOptions,
): Observable<ProviderStreamFact> =>
	defer(() => {
		const abort = new AbortController();
		const pause$ = options.pause$.pipe(
			filter(isSteerControlPause),
			take(1),
			tap(() => {
				abort.abort();
				options.onAbort?.();
			}),
			map(() => ({ kind: 'provider.paused' }) as const),
		);
		const chunks$ = withIdleTimeout(
			from(options.createStream(abort.signal)).pipe(
				switchMap((stream) => from(stream)),
				map(toProviderStreamFact),
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
		);

		return merge(chunks$, pause$).pipe(
			takeWhile((fact) => !isTerminalProviderFact(fact), true),
			takeUntil(options.cancel$),
			finalize(() => {
				abort.abort();
				options.onAbort?.();
			}),
		);
	});
