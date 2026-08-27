import { describe, expect, it } from 'vitest';
import { createEmbedding, type EmbeddingsClient } from './create-embedding.js';

const vectorClient = (
	embeddings: readonly (readonly number[])[],
	onCreate?: (
		signal: AbortSignal | undefined,
		body: { readonly encoding_format?: 'float' | 'base64' },
	) => void,
): EmbeddingsClient => ({
	embeddings: {
		create: async (body, options) => {
			onCreate?.(options?.signal, body);
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

	it('maps Float32Array embeddings from the client', async () => {
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
			createClient: () => ({
				embeddings: {
					create: async () => ({
						data: [{ embedding: Float32Array.from([1, 2, 3]) }],
					}),
				},
			}),
		});

		const result = await factory({
			providerId: 'openai',
			model: 'text-embedding-3-small',
			texts: ['a'],
		});
		expect(Array.from(result.vectors[0] ?? [])).toEqual([1, 2, 3]);
	});

	it('throws when embedding is not a numeric array', async () => {
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
			createClient: () => ({
				embeddings: {
					create: async () => ({
						data: [{ embedding: { length: 256 } }],
					}),
				},
			}),
		});

		await expect(
			factory({
				providerId: 'openai',
				model: 'text-embedding-3-small',
				texts: ['a'],
			}),
		).rejects.toThrow(/numeric embedding array/);
		await expect(
			factory({
				providerId: 'openai',
				model: 'text-embedding-3-small',
				texts: ['a'],
			}),
		).rejects.toThrow(/embeddingIsArray":false/);
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

	it('requests encoding_format float so the SDK skips base64 unwrap', async () => {
		const bodies: { readonly encoding_format?: 'float' | 'base64' }[] = [];
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
			createClient: () =>
				vectorClient([[1, 0]], (_signal, body) => {
					bodies.push(body);
				}),
		});

		await factory({
			providerId: 'openai',
			model: 'text-embedding-3-small',
			texts: ['a'],
		});

		expect(bodies.map((body) => body.encoding_format)).toEqual(['float']);
	});

	it('orders client rows by index', async () => {
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
			createClient: () => ({
				embeddings: {
					create: async () => ({
						data: [
							{ index: 1, embedding: [0, 1] },
							{ index: 0, embedding: [1, 0] },
						],
					}),
				},
			}),
		});

		const result = await factory({
			providerId: 'openai',
			model: 'text-embedding-3-small',
			texts: ['a', 'b'],
		});
		expect(Array.from(result.vectors[0] ?? [])).toEqual([1, 0]);
		expect(Array.from(result.vectors[1] ?? [])).toEqual([0, 1]);
	});

	it('rejects a zero-norm Float32Array from the client', async () => {
		const factory = createEmbedding({
			resolveProvider: async () => ({ apiKey: 'test' }),
			createClient: () => ({
				embeddings: {
					create: async () => ({
						data: [{ embedding: new Float32Array(256) }],
					}),
				},
			}),
		});

		await expect(
			factory({
				providerId: 'openai',
				model: 'text-embedding-3-small',
				texts: ['a'],
			}),
		).rejects.toThrow(/zero embedding vector/);
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
