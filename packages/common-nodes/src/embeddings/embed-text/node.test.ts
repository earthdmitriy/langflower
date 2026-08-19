import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { attachRunHostServices } from '../../ai/features/run-host-services.js';
import { createEmbedding, type CreateEmbedding } from '../create-embedding.js';
import { embedTextNode } from './node.js';

const abortError = (): Error => {
	const error = new Error('The operation was aborted');
	error.name = 'AbortError';
	return error;
};

const fakeCreateEmbedding =
	(
		options: {
			readonly vectors?: readonly number[];
			readonly onCall?: (args: {
				readonly providerId: string;
				readonly model: string;
				readonly texts: readonly string[];
				readonly signal?: AbortSignal;
			}) => void;
			readonly hangUntilAbort?: boolean;
		} = {},
	): CreateEmbedding =>
	async (args) => {
		options.onCall?.(args);
		if (args.signal?.aborted === true) {
			throw abortError();
		}
		if (options.hangUntilAbort === true) {
			await new Promise<never>((_resolve, reject) => {
				args.signal?.addEventListener('abort', () => {
					reject(abortError());
				});
			});
		}
		const vector = options.vectors ?? [1, 2, 3];
		return {
			dim: vector.length,
			vectors: [Float32Array.from(vector)],
		};
	};

const connectEmbedText = (
	params: Readonly<Record<string, unknown>>,
	createEmbedding: CreateEmbedding | undefined,
	text: string,
) => {
	const instance = embedTextNode.getInstance();
	instance.ctxConnection.connect(
		of(
			attachRunHostServices(
				{
					projectDir: '/tmp',
					runId: 'test',
					nodeId: 'embed-text-1',
					params,
					uiSchema: embedTextNode.uiSchema,
				},
				createEmbedding !== undefined ? { createEmbedding } : {},
			),
		),
	);
	instance.inputs.text.connect(of(text));
	return instance;
};

describe('common-embed-text', () => {
	it('maps the first vector to json, dim, and compact preview', async () => {
		const instance = connectEmbedText(
			{ providerId: 'openai', model: 'text-embedding-3-small' },
			fakeCreateEmbedding({
				vectors: [1, 2, 3, 4, 5, 6, 7, 8, 9],
			}),
			'hello',
		);

		await expect(
			firstValueFrom(instance.outputs.vector.value$),
		).resolves.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		await expect(firstValueFrom(instance.outputs.dim.value$)).resolves.toBe(
			9,
		);
		await expect(
			firstValueFrom(instance.outputs.preview.value$),
		).resolves.toBe('dim=9  [1, 2, 3, 4, 5, 6, 7, 8, …]');
	});

	it('sends raw texts (no e5 prefix) and uses Settings default', async () => {
		const calls: string[][] = [];
		const instance = embedTextNode.getInstance();
		instance.ctxConnection.connect(
			of(
				attachRunHostServices(
					{
						projectDir: '/tmp',
						runId: 'test',
						nodeId: 'embed-text-1',
						params: { providerId: '', model: '' },
						uiSchema: embedTextNode.uiSchema,
					},
					{
						createEmbedding: fakeCreateEmbedding({
							onCall: (args) => {
								calls.push([...args.texts]);
								expect(args.providerId).toBe('lmstudio');
								expect(args.model).toBe('nomic');
							},
						}),
						defaultEmbedding: {
							providerId: 'lmstudio',
							model: 'nomic',
						},
					},
				),
			),
		);
		instance.inputs.text.connect(of('hello'));

		await firstValueFrom(instance.outputs.dim.value$);
		expect(calls).toEqual([['hello']]);
	});

	it('forwards AbortSignal into createEmbedding', async () => {
		const seen: AbortSignal[] = [];
		const instance = connectEmbedText(
			{ providerId: 'openai', model: 'emb' },
			fakeCreateEmbedding({
				onCall: (args) => {
					if (args.signal !== undefined) {
						seen.push(args.signal);
					}
				},
			}),
			'hello',
		);

		await firstValueFrom(instance.outputs.dim.value$);
		expect(seen).toHaveLength(1);
		expect(seen[0]).toBeInstanceOf(AbortSignal);
	});

	it('aborts in-flight HTTP when the output is unsubscribed', async () => {
		let aborted = false;
		const instance = connectEmbedText(
			{ providerId: 'openai', model: 'emb' },
			fakeCreateEmbedding({
				hangUntilAbort: true,
				onCall: (args) => {
					args.signal?.addEventListener('abort', () => {
						aborted = true;
					});
				},
			}),
			'hello',
		);
		const sub = instance.outputs.vector.value$.subscribe({
			error: () => undefined,
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		sub.unsubscribe();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(aborted).toBe(true);
	});

	it('throws when the host factory is missing', async () => {
		const instance = connectEmbedText(
			{ providerId: 'openai', model: 'emb' },
			undefined,
			'hello',
		);

		await expect(
			firstValueFrom(instance.outputs.vector.error$),
		).resolves.toMatchObject({
			message:
				'OpenAI-compatible embeddings are only available during server workflow runs',
		});
	});

	it('throws when provider and model are empty without a default', async () => {
		const instance = connectEmbedText(
			{ providerId: '', model: '' },
			createEmbedding({
				resolveProvider: async () => ({ apiKey: 'test' }),
			}),
			'hello',
		);

		await expect(
			firstValueFrom(instance.outputs.vector.error$),
		).resolves.toMatchObject({
			message: expect.stringMatching(/Provider is required/),
		});
	});
});
