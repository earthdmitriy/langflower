import type { SteerControlPayload } from '@langflower/node-sdk/llm';
import { Subject, firstValueFrom, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionStreamChunk } from '../../chat-completion-stream.js';
import { observeProviderStream } from './observe-provider-stream.js';

const neverEndingStream = async function* (): AsyncGenerator<never> {
	await new Promise(() => undefined);
};

const repeatingChunks = (
	kind: 'reasoning' | 'draft',
	text: string,
	count: number,
): AsyncGenerator<ChatCompletionStreamChunk> =>
	(async function* () {
		for (let index = 0; index < count; index += 1) {
			yield { kind, text };
		}
		yield { kind: 'done' as const, text: '' };
	})();

describe('observeProviderStream', () => {
	it('turns an idle stream into a terminal idle fact and aborts', async () => {
		vi.useFakeTimers();
		const pause$ = new Subject<SteerControlPayload>();
		const cancel$ = new Subject<void>();
		let signal: AbortSignal | undefined;
		const result = firstValueFrom(
			observeProviderStream({
				createStream: async (nextSignal) => {
					signal = nextSignal;
					return neverEndingStream();
				},
				pause$,
				cancel$,
				idleTimeoutMs: 50,
			}).pipe(toArray()),
		);

		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toEqual([
			{ kind: 'provider.idle', idleMs: 50 },
		]);
		expect(signal?.aborted).toBe(true);
		vi.useRealTimers();
	});

	it('turns Pause into a terminal fact and aborts the provider', async () => {
		const pause$ = new Subject<SteerControlPayload>();
		const cancel$ = new Subject<void>();
		let signal: AbortSignal | undefined;
		const result = firstValueFrom(
			observeProviderStream({
				createStream: async (nextSignal) => {
					signal = nextSignal;
					return neverEndingStream();
				},
				pause$,
				cancel$,
				idleTimeoutMs: 0,
			}).pipe(toArray()),
		);

		await Promise.resolve();
		pause$.next({ kind: 'pause' });

		await expect(result).resolves.toEqual([{ kind: 'provider.paused' }]);
		expect(signal?.aborted).toBe(true);
	});

	it('classifies a provider 500 instead of erroring the stream', async () => {
		const pause$ = new Subject<SteerControlPayload>();
		const cancel$ = new Subject<void>();
		const result = await firstValueFrom(
			observeProviderStream({
				createStream: async () => {
					throw {
						status: 500,
						message: '<html>Internal Server Error</html>',
						headers: { 'content-type': 'text/html' },
					};
				},
				pause$,
				cancel$,
				idleTimeoutMs: 0,
			}).pipe(toArray()),
		);

		expect(result).toEqual([
			{
				kind: 'provider.failed',
				failure: {
					kind: 'provider-unavailable',
					message:
						'Provider returned HTTP 500 with an HTML error response.',
					recoverable: true,
					status: 500,
					rawContentType: 'text/html',
				},
			},
		]);
	});

	it('aborts on five identical reasoning deltas without erroring', async () => {
		const pause$ = new Subject<SteerControlPayload>();
		const cancel$ = new Subject<void>();
		let signal: AbortSignal | undefined;
		const facts = await firstValueFrom(
			observeProviderStream({
				createStream: async (nextSignal) => {
					signal = nextSignal;
					return repeatingChunks('reasoning', 'loop', 5);
				},
				pause$,
				cancel$,
				idleTimeoutMs: 0,
			}).pipe(toArray()),
		);

		expect(facts).toContainEqual({
			kind: 'provider.dead-loop',
			channel: 'reasoning',
			reason: 'consecutive',
		});
		expect(
			facts.filter((fact) => fact.kind === 'provider.reasoning'),
		).toHaveLength(5);
		expect(facts.some((fact) => fact.kind === 'provider.failed')).toBe(
			false,
		);
		expect(signal?.aborted).toBe(true);
	});

	it('aborts on five identical draft deltas', async () => {
		const pause$ = new Subject<SteerControlPayload>();
		const cancel$ = new Subject<void>();
		let signal: AbortSignal | undefined;
		const facts = await firstValueFrom(
			observeProviderStream({
				createStream: async (nextSignal) => {
					signal = nextSignal;
					return repeatingChunks('draft', 'hello', 5);
				},
				pause$,
				cancel$,
				idleTimeoutMs: 0,
			}).pipe(toArray()),
		);

		expect(facts.at(-1)).toEqual({
			kind: 'provider.dead-loop',
			channel: 'draft',
			reason: 'consecutive',
		});
		expect(signal?.aborted).toBe(true);
	});

	it('trips a reasoning loop with no draft chunks', async () => {
		const pause$ = new Subject<SteerControlPayload>();
		const cancel$ = new Subject<void>();
		const facts = await firstValueFrom(
			observeProviderStream({
				createStream: async () =>
					repeatingChunks('reasoning', 'same', 5),
				pause$,
				cancel$,
				idleTimeoutMs: 0,
			}).pipe(toArray()),
		);

		expect(facts.some((fact) => fact.kind === 'provider.draft')).toBe(
			false,
		);
		expect(facts).toContainEqual({
			kind: 'provider.dead-loop',
			channel: 'reasoning',
			reason: 'consecutive',
		});
	});

	it('does not emit dead-loop for unique deltas plus done', async () => {
		const pause$ = new Subject<SteerControlPayload>();
		const cancel$ = new Subject<void>();
		const facts = await firstValueFrom(
			observeProviderStream({
				createStream: async () =>
					(async function* () {
						yield { kind: 'draft' as const, text: 'Cherry ' };
						yield { kind: 'draft' as const, text: 'blossoms' };
						yield {
							kind: 'done' as const,
							text: 'Cherry blossoms',
						};
					})(),
				pause$,
				cancel$,
				idleTimeoutMs: 0,
			}).pipe(toArray()),
		);

		expect(facts.some((fact) => fact.kind === 'provider.dead-loop')).toBe(
			false,
		);
		expect(facts.at(-1)).toMatchObject({ kind: 'provider.done' });
	});
});
