import { describe, expect, it } from 'vitest';
import { createEmbedding, type EmbeddingsClient } from './create-embedding.js';

const vectorClient = (
	embeddings: readonly (readonly number[])[],
	onCreate?: (signal: AbortSignal | undefined) => void,
): EmbeddingsClient => ({
	embeddings: {
		create: async (_body, options) => {
			onCreate?.(options?.signal);
			return {
				data: embeddings.map((embedding) => ({ embedding })),
			};
		},
	},
});

describe('createEmbedding', () => {
	it('throws when provider, model, or texts are missing', async () => {
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
		});

		await expect(
			factory({
				providerId: '',
				model: 'text-embedding-3-small',
				texts: ['a'],
			}),
		).rejects.toThrow(/Provider is required/);

		await expect(
			factory({
				providerId: 'openai',
				model: '',
				texts: ['a'],
			}),
		).rejects.toThrow(/Model is required/);

		await expect(
			factory({
				providerId: 'openai',
				model: 'text-embedding-3-small',
				texts: [],
			}),
		).rejects.toThrow(/Texts are required/);
	});

	it('maps client embeddings to Float32Array and dim', async () => {
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
			createClient: () =>
				vectorClient([
					[1, 2, 3],
					[4, 5, 6],
				]),
		});

		const result = await factory({
			providerId: 'openai',
			model: 'text-embedding-3-small',
			texts: ['a', 'b'],
		});

		expect(result.dim).toBe(3);
		expect(result.vectors).toHaveLength(2);
		expect(Array.from(result.vectors[0] ?? [])).toEqual([1, 2, 3]);
		expect(result.vectors[0]).toBeInstanceOf(Float32Array);
	});

	it('throws when batch vectors have mixed dims', async () => {
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
			createClient: () =>
				vectorClient([
					[1, 2],
					[1, 2, 3],
				]),
		});

		await expect(
			factory({
				providerId: 'openai',
				model: 'text-embedding-3-small',
				texts: ['a', 'b'],
			}),
		).rejects.toThrow(/dim mismatch/);
	});

	it('redacts secret-looking error messages', async () => {
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'sk-secret' }),
			createClient: () => ({
				embeddings: {
					create: async () => {
						throw new Error('Invalid apiKey sk-secret');
					},
				},
			}),
		});

		await expect(
			factory({
				providerId: 'openai',
				model: 'text-embedding-3-small',
				texts: ['a'],
			}),
		).rejects.toThrow('Failed to create embeddings for provider');
	});

	it('forwards AbortSignal to the embeddings client', async () => {
		const seen: AbortSignal[] = [];
		const controller = new AbortController();
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
			createClient: () =>
				vectorClient([[1, 2]], (signal) => {
					if (signal !== undefined) {
						seen.push(signal);
					}
				}),
		});

		await factory({
			providerId: 'openai',
			model: 'text-embedding-3-small',
			texts: ['a'],
			signal: controller.signal,
		});

		expect(seen).toEqual([controller.signal]);
	});

	it('fails closed when the signal is already aborted', async () => {
		let created = false;
		const controller = new AbortController();
		controller.abort();
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
			createClient: () => ({
				embeddings: {
					create: async () => {
						created = true;
						return { data: [{ embedding: [1] }] };
					},
				},
			}),
		});

		await expect(
			factory({
				providerId: 'openai',
				model: 'text-embedding-3-small',
				texts: ['a'],
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(created).toBe(false);
	});
});
