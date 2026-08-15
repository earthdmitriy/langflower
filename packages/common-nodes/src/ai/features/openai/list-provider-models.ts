import OpenAI from 'openai';
import type { OpenAiProviderCredentials } from './create-chat-completion-stream.js';

export type ProviderModelEntry = {
	readonly id: string;
	readonly name?: string;
};

export type ListProviderModelsResult = {
	readonly models: readonly ProviderModelEntry[];
	readonly error?: string;
};

type OpenAiModelsClient = {
	readonly models: {
		readonly list: () => Promise<{
			readonly data: readonly {
				readonly id: string;
				readonly name?: string;
			}[];
		}>;
	};
};

type ListProviderModelsDeps = {
	readonly createClient?: (
		credentials: OpenAiProviderCredentials,
	) => OpenAiModelsClient;
};

const SECRET_SUBSTRINGS = ['sk-', 'apiKey', 'api_key', 'authorization'];

const toSafeErrorMessage = (message: string): string => {
	const lower = message.toLowerCase();

	for (const needle of SECRET_SUBSTRINGS) {
		if (lower.includes(needle.toLowerCase())) {
			return 'Failed to list models for provider';
		}
	}

	return message;
};

const mapModelEntry = (entry: { readonly id: string }): ProviderModelEntry => {
	const name =
		'name' in entry && typeof entry.name === 'string'
			? entry.name
			: undefined;

	return {
		id: entry.id,
		...(name !== undefined ? { name } : {}),
	};
};

const defaultCreateClient = (
	credentials: OpenAiProviderCredentials,
): OpenAiModelsClient =>
	new OpenAI({
		apiKey: credentials.apiKey ?? 'local-no-key',
		...(credentials.baseURL !== undefined
			? { baseURL: credentials.baseURL }
			: {}),
	}) as OpenAiModelsClient;

/**
 * Lists models for resolved credentials. Never throws — failures return
 * `{ models: [], error }`.
 */
export const listProviderModels = async (
	credentials: OpenAiProviderCredentials,
	deps?: ListProviderModelsDeps,
): Promise<ListProviderModelsResult> => {
	try {
		const createClient = deps?.createClient ?? defaultCreateClient;
		const client = createClient(credentials);
		const page = await client.models.list();
		const models = (page.data ?? []).map(mapModelEntry);

		if (models.length === 0) {
			return {
				models: [],
				error: 'Provider returned no models. For LM Studio / local OpenAI-compatible servers, baseURL usually ends with /v1 (e.g. http://127.0.0.1:1234/v1).',
			};
		}

		return { models };
	} catch (error) {
		const raw = error instanceof Error ? error.message : String(error);

		return {
			models: [],
			error: toSafeErrorMessage(raw),
		};
	}
};
