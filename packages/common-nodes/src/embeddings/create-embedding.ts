/**
 * Unbound OpenAI-compatible embeddings factory.
 * Caller supplies credential resolve (server injects secrets).
 * Does not rewrite texts for EmbedHandle `role` — packs/catalog do that.
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
			readonly data: readonly { readonly embedding: readonly number[] }[];
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

const toVectors = (
	data: readonly { readonly embedding: readonly number[] }[],
): CreateEmbeddingResult => {
	if (data.length === 0) {
		throw new Error('Provider returned no embedding vectors');
	}

	const vectors = data.map((row) => Float32Array.from(row.embedding));
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
				},
				args.signal !== undefined ? { signal: args.signal } : {},
			);

			return toVectors(response.data);
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw error;
			}

			const raw = error instanceof Error ? error.message : String(error);
			throw new Error(toSafeErrorMessage(raw));
		}
	};
};
