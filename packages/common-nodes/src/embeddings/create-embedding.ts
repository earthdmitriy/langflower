/**
 * Unbound OpenAI-compatible embeddings factory.
 * Caller supplies credential resolve (server injects secrets).
 * Does not rewrite texts for EmbedHandle `role` — packs/catalog do that.
 *
 * Always pass `encoding_format: 'float'`. openai-node otherwise defaults to
 * `base64` and runs `toFloat32Array` on the body; local servers that return
 * JSON `number[]` become a zero typed array. Chat completions have no such
 * field — this is embeddings-only.
 */
import OpenAI from 'openai';
import type { OpenAiProviderCredentials } from '../ai/features/openai/create-chat-completion-stream.js';

export type CreateEmbeddingArgs = {
	readonly providerId: string;
	readonly model: string;
	readonly texts: readonly string[];
	readonly signal?: AbortSignal;
};

export type CreateEmbeddingResult = {
	readonly dim: number;
	readonly vectors: readonly Float32Array[];
};

export type CreateEmbedding = (
	args: CreateEmbeddingArgs,
) => Promise<CreateEmbeddingResult>;

export type EmbeddingsCreateBody = {
	readonly model: string;
	readonly input: readonly string[];
	readonly encoding_format?: 'float' | 'base64';
};

export type EmbeddingsCreateOptions = {
	readonly signal?: AbortSignal;
};

export type EmbeddingsClient = {
	readonly embeddings: {
		readonly create: (
			body: EmbeddingsCreateBody,
			options?: EmbeddingsCreateOptions,
		) => Promise<{
			readonly data: readonly {
				readonly embedding: unknown;
				readonly index?: number;
			}[];
		}>;
	};
};

export type CreateEmbeddingDeps = {
	readonly resolveProvider: (
		providerId: string,
	) => Promise<OpenAiProviderCredentials>;
	readonly createClient?: (
		credentials: OpenAiProviderCredentials,
	) => EmbeddingsClient;
};

const SECRET_SUBSTRINGS = ['sk-', 'apiKey', 'api_key', 'authorization'];

const requireNonEmpty = (value: string, label: string): string => {
	const trimmed = value.trim();

	if (trimmed.length === 0) {
		throw new Error(
			`${label} is required for OpenAI-compatible embeddings`,
		);
	}

	return trimmed;
};

const toSafeErrorMessage = (message: string): string => {
	const lower = message.toLowerCase();

	for (const needle of SECRET_SUBSTRINGS) {
		if (lower.includes(needle.toLowerCase())) {
			return 'Failed to create embeddings for provider';
		}
	}

	return message;
};

const abortError = (): Error => {
	const error = new Error('The operation was aborted');
	error.name = 'AbortError';
	return error;
};

const defaultCreateClient = (
	credentials: OpenAiProviderCredentials,
): EmbeddingsClient =>
	new OpenAI({
		apiKey: credentials.apiKey ?? 'local-no-key',
		...(credentials.baseURL !== undefined
			? { baseURL: credentials.baseURL }
			: {}),
	}) as unknown as EmbeddingsClient;

const first8 = (value: unknown): readonly unknown[] => {
	if (Array.isArray(value) || ArrayBuffer.isView(value)) {
		const list = value as ArrayLike<unknown>;
		const out: unknown[] = [];
		const n = Math.min(8, list.length);
		for (let i = 0; i < n; i += 1) {
			out.push(list[i]);
		}
		return out;
	}
	return [];
};

const embeddingSnapshot = (embedding: unknown): string => {
	const embeddingLen =
		Array.isArray(embedding) || ArrayBuffer.isView(embedding)
			? (embedding as ArrayLike<unknown>).length
			: undefined;
	return JSON.stringify({
		embeddingIsArray: Array.isArray(embedding),
		embeddingType: embedding === null ? 'null' : typeof embedding,
		embeddingCtor:
			typeof embedding === 'object' && embedding !== null
				? embedding.constructor.name
				: undefined,
		embeddingLen,
		embeddingFirst8: first8(embedding),
	});
};

const missingNumericMessage = (embedding: unknown): string =>
	`Embedding item is missing a numeric embedding array (is a chat model loaded instead of an embedding model?). ${embeddingSnapshot(embedding)}`;

const asNumericVector = (embedding: unknown): ArrayLike<number> => {
	if (
		embedding instanceof Float32Array ||
		embedding instanceof Float64Array
	) {
		return embedding;
	}
	if (Array.isArray(embedding)) {
		const numbers = embedding.filter(
			(item): item is number =>
				typeof item === 'number' && Number.isFinite(item),
		);
		if (numbers.length !== embedding.length) {
			throw new Error(missingNumericMessage(embedding));
		}
		return numbers;
	}
	throw new Error(missingNumericMessage(embedding));
};

const l2Norm = (values: ArrayLike<number>): number => {
	let sumSq = 0;
	for (let i = 0; i < values.length; i += 1) {
		const n = Number(values[i] ?? 0);
		sumSq += n * n;
	}
	return Math.sqrt(sumSq);
};

const orderByIndex = (
	data: readonly {
		readonly embedding?: unknown;
		readonly index?: unknown;
	}[],
	textCount: number,
): readonly { readonly embedding: unknown }[] => {
	const byIndex = new Map<number, unknown>();
	data.forEach((item, fallbackIndex) => {
		const index =
			typeof item.index === 'number' ? item.index : fallbackIndex;
		byIndex.set(index, item.embedding);
	});
	return Array.from({ length: textCount }, (_, index) => {
		if (!byIndex.has(index)) {
			throw new Error(`Embedding batch missing index ${String(index)}`);
		}
		return { embedding: byIndex.get(index) };
	});
};

const toVectors = (
	data: readonly { readonly embedding: unknown }[],
): CreateEmbeddingResult => {
	if (data.length === 0) {
		throw new Error('Provider returned no embedding vectors');
	}

	const vectors = data.map((row) =>
		Float32Array.from(asNumericVector(row.embedding)),
	);
	const dim = vectors[0]?.length ?? 0;

	if (dim === 0) {
		throw new Error('Provider returned an empty embedding vector');
	}

	for (const vector of vectors) {
		if (vector.length !== dim) {
			throw new Error(
				`Embedding batch dim mismatch: expected ${dim}, got ${vector.length}`,
			);
		}
		if (l2Norm(vector) === 0) {
			throw new Error(
				'Provider returned a zero embedding vector (is a chat model loaded instead of an embedding model?).',
			);
		}
	}

	return { dim, vectors };
};

/**
 * Unbound embeddings HTTP factory (`POST /v1/embeddings`).
 * Forwards {@link CreateEmbeddingArgs.signal} so runner Stop can cancel.
 */
export const createEmbedding = (deps: CreateEmbeddingDeps): CreateEmbedding => {
	const createClient = deps.createClient ?? defaultCreateClient;

	return async (args) => {
		if (args.signal?.aborted === true) {
			throw abortError();
		}

		const providerId = requireNonEmpty(args.providerId, 'Provider');
		const model = requireNonEmpty(args.model, 'Model');

		if (args.texts.length === 0) {
			throw new Error(
				'Texts are required for OpenAI-compatible embeddings',
			);
		}

		const credentials = await deps.resolveProvider(providerId);
		const client = createClient(credentials);

		try {
			const response = await client.embeddings.create(
				{
					model,
					input: [...args.texts],
					encoding_format: 'float',
				},
				args.signal !== undefined ? { signal: args.signal } : {},
			);

			return toVectors(orderByIndex(response.data, args.texts.length));
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw error;
			}

			const raw = error instanceof Error ? error.message : String(error);
			throw new Error(toSafeErrorMessage(raw));
		}
	};
};
