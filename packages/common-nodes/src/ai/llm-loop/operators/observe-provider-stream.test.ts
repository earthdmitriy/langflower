import type { SteerControlPayload } from '@langflower/node-sdk/llm';
import { Subject, firstValueFrom, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { observeProviderStream } from './observe-provider-stream.js';

const neverEndingStream = async function* (): AsyncGenerator<never> {
	await new Promise(() => undefined);
};

describe('observeProviderStream', () => {
	it('turns an idle stream into a terminal idle fact', async () => {
		vi.useFakeTimers();
		const pause$ = new Subject<SteerControlPayload>();
		const cancel$ = new Subject<void>();
		const result = firstValueFrom(
			observeProviderStream({
				createStream: async () => neverEndingStream(),
				pause$,
				cancel$,
				idleTimeoutMs: 50,
			}).pipe(toArray()),
		);

		await vi.advanceTimersByTimeAsync(50);
		await expect(result).resolves.toEqual([
			{ kind: 'provider.idle', idleMs: 50 },
		]);
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
});
