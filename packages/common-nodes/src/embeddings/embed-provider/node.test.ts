import {
	defineNode,
	EMBED_HANDLE_WIRE_TYPE,
	isEmbedHandle,
	type EmbedHandle,
} from '@langflower/node-sdk';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { attachRunHostServices } from '../../ai/features/run-host-services.js';
import type { CreateEmbedding } from '../create-embedding.js';
import { embedProviderNode } from './node.js';

const abortError = (): Error => {
	const error = new Error('The operation was aborted');
	error.name = 'AbortError';
	return error;
};

type FakeCall = {
	readonly texts: readonly string[];
	readonly signal?: AbortSignal;
};

const fakeCreateEmbedding = (
	options: {
		readonly probeDim?: number;
		readonly batchDim?: number;
		readonly onCall?: (args: FakeCall) => void;
		readonly hangUntilAbort?: boolean;
	} = {},
): CreateEmbedding => {
	let callIndex = 0;
	return async (args) => {
		options.onCall?.({ texts: args.texts, signal: args.signal });
		if (args.signal?.aborted === true) {
			throw abortError();
		}
		if (options.hangUntilAbort === true && callIndex > 0) {
			await new Promise<never>((_resolve, reject) => {
				args.signal?.addEventListener('abort', () => {
					reject(abortError());
				});
			});
		}
		callIndex += 1;
		const dim =
			callIndex === 1
				? (options.probeDim ?? 3)
				: (options.batchDim ?? options.probeDim ?? 3);
		const vector = Float32Array.from(Array.from({ length: dim }, () => 1));
		return {
			dim,
			vectors: args.texts.map(() => vector),
		};
	};
};

const connectProvider = (
	params: Readonly<Record<string, unknown>>,
	createEmbedding: CreateEmbedding | undefined,
	defaultEmbedding?: { readonly providerId: string; readonly model: string },
) => {
	const instance = embedProviderNode.getInstance();
	instance.ctxConnection.connect(
		of(
			attachRunHostServices(
				{
					projectDir: '/tmp',
					runId: 'test',
					nodeId: 'embed-provider-1',
					params,
					uiSchema: embedProviderNode.uiSchema,
				},
				{
					...(createEmbedding !== undefined
						? { createEmbedding }
						: {}),
					...(defaultEmbedding !== undefined
						? { defaultEmbedding }
						: {}),
				},
			),
		),
	);
	return instance;
};

const readEmbedHandle = async (
	instance: ReturnType<typeof embedProviderNode.getInstance>,
): Promise<{
	readonly handle: EmbedHandle;
	readonly subscription: { unsubscribe: () => void };
}> => {
	let handle: EmbedHandle | undefined;
	const subscription = instance.outputs.embed.value$.subscribe({
		next: (value) => {
			handle = value;
		},
		error: () => undefined,
	});
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
	if (handle === undefined) {
		subscription.unsubscribe();
		throw new Error('EmbedHandle was not emitted');
	}
	return { handle, subscription };
};

/** UC2 test-only consumer — not registered in the catalog. */
const embedConsumerTestNode = defineNode({
	type: 'test-embed-consumer',
	displayName: 'Test embed consumer',
	uiSchema: [] as const,
	inputs: {
		embed: {
			wireType: EMBED_HANDLE_WIRE_TYPE,
			required: true,
		},
	},
	outputs: {
		dim: { wireType: 'number' },
		first: { wireType: 'number' },
	},
	async execute(_ctx, inputs) {
		const handle = inputs['embed'];
		if (!isEmbedHandle(handle)) {
			throw new Error('embed input must be an EmbedHandle');
		}
		const vectors = await handle.embedTexts(['search me'], {
			role: 'query',
		});
		const first = vectors[0]?.[0] ?? 0;
		return { dim: handle.dim, first };
	},
});

describe('common-embed-provider', () => {
	it('probes dim before emitting an EmbedHandle', async () => {
		const calls: readonly string[][] = [];
		const instance = connectProvider(
			{ providerId: 'openai', model: 'text-embedding-3-small' },
			fakeCreateEmbedding({
				probeDim: 4,
				onCall: (args) => {
					calls.push([...args.texts]);
				},
			}),
		);

		const handle = await firstValueFrom(instance.outputs.embed.value$);
		expect(isEmbedHandle(handle)).toBe(true);
		expect(handle.dim).toBe(4);
		expect(calls[0]).toEqual(['passage: x']);
	});

	it('uses Settings default when panel provider/model are empty', async () => {
		const seen: { providerId: string; model: string }[] = [];
		const factory = fakeCreateEmbedding({});
		const wrapped: CreateEmbedding = async (args) => {
			seen.push({
				providerId: args.providerId,
				model: args.model,
			});
			return factory(args);
		};
		const instance = connectProvider(
			{ providerId: '', model: '' },
			wrapped,
			{ providerId: 'lmstudio', model: 'nomic' },
		);

		await firstValueFrom(instance.outputs.embed.value$);
		expect(seen[0]).toEqual({
			providerId: 'lmstudio',
			model: 'nomic',
		});
	});

	it('prefixes query role on embedTexts', async () => {
		const batchTexts: string[][] = [];
		const instance = connectProvider(
			{ providerId: 'openai', model: 'emb' },
			fakeCreateEmbedding({
				onCall: (args) => {
					if (args.texts[0]?.startsWith('query:')) {
						batchTexts.push([...args.texts]);
					}
				},
			}),
		);

		const { handle, subscription } = await readEmbedHandle(instance);
		try {
			await handle.embedTexts(['hello'], { role: 'query' });
			expect(batchTexts).toEqual([['query: hello']]);
		} finally {
			subscription.unsubscribe();
		}
	});

	it('prefixes document role by default on embedTexts', async () => {
		const batchTexts: string[][] = [];
		const instance = connectProvider(
			{ providerId: 'openai', model: 'emb' },
			fakeCreateEmbedding({
				onCall: (args) => {
					if (args.texts[0] === 'passage: doc') {
						batchTexts.push([...args.texts]);
					}
				},
			}),
		);

		const { handle, subscription } = await readEmbedHandle(instance);
		try {
			await handle.embedTexts(['doc']);
			expect(batchTexts).toEqual([['passage: doc']]);
		} finally {
			subscription.unsubscribe();
		}
	});

	it('throws when a later batch returns a different dim', async () => {
		const instance = connectProvider(
			{ providerId: 'openai', model: 'emb' },
			fakeCreateEmbedding({ probeDim: 3, batchDim: 5 }),
		);

		const { handle, subscription } = await readEmbedHandle(instance);
		try {
			await expect(handle.embedTexts(['a'])).rejects.toThrow(
				/Embedding dim mismatch: expected 3, got 5/,
			);
		} finally {
			subscription.unsubscribe();
		}
	});

	it('aborts in-flight embedTexts when the provider output is unsubscribed', async () => {
		let aborted = false;
		const instance = connectProvider(
			{ providerId: 'openai', model: 'emb' },
			fakeCreateEmbedding({
				hangUntilAbort: true,
				onCall: (args) => {
					args.signal?.addEventListener('abort', () => {
						aborted = true;
					});
				},
			}),
		);

		const { handle, subscription } = await readEmbedHandle(instance);
		const pending = handle.embedTexts(['slow']);
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		subscription.unsubscribe();
		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		expect(aborted).toBe(true);
	});

	it('throws when the host factory is missing', async () => {
		const instance = connectProvider(
			{ providerId: 'openai', model: 'emb' },
			undefined,
		);

		await expect(
			firstValueFrom(instance.outputs.embed.error$),
		).resolves.toMatchObject({
			message:
				'OpenAI-compatible embeddings are only available during server workflow runs',
		});
	});
});

describe('UC2 test embed consumer', () => {
	it('calls embedTexts with role query via wired EmbedHandle', async () => {
		const batchTexts: string[][] = [];
		const provider = connectProvider(
			{ providerId: 'openai', model: 'emb' },
			fakeCreateEmbedding({
				probeDim: 2,
				onCall: (args) => {
					if (args.texts[0]?.startsWith('query:')) {
						batchTexts.push([...args.texts]);
					}
				},
			}),
		);
		const { handle, subscription } = await readEmbedHandle(provider);

		try {
			const consumer = embedConsumerTestNode.getInstance();
			consumer.ctxConnection.connect(
				of({
					projectDir: '/tmp',
					runId: 'test',
					nodeId: 'embed-consumer-1',
					params: {},
					uiSchema: embedConsumerTestNode.uiSchema,
				}),
			);
			consumer.inputs.embed.connect(of(handle));

			await expect(
				firstValueFrom(consumer.outputs.dim.value$),
			).resolves.toBe(2);
			await expect(
				firstValueFrom(consumer.outputs.first.value$),
			).resolves.toBe(1);
			expect(batchTexts.length).toBeGreaterThanOrEqual(1);
			expect(
				batchTexts.every((texts) => texts[0] === 'query: search me'),
			).toBe(true);
		} finally {
			subscription.unsubscribe();
		}
	});
});
