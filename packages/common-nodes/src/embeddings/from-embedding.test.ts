import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { fromEmbedding } from './from-embedding.js';

describe('fromEmbedding', () => {
	it('forwards the teardown signal into work', async () => {
		let seen: AbortSignal | undefined;
		const value = await firstValueFrom(
			fromEmbedding(async (signal) => {
				seen = signal;
				return 7;
			}),
		);

		expect(value).toBe(7);
		expect(seen).toBeInstanceOf(AbortSignal);
	});

	it('aborts the signal when unsubscribed before settle', async () => {
		let aborted = false;
		const obs = fromEmbedding(async (signal) => {
			await new Promise<never>((_resolve, reject) => {
				signal.addEventListener('abort', () => {
					aborted = true;
					const error = new Error('The operation was aborted');
					error.name = 'AbortError';
					reject(error);
				});
			});
		});
		const sub = obs.subscribe({ error: () => undefined });
		sub.unsubscribe();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(aborted).toBe(true);
	});
});
