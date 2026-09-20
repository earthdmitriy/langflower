/** Shared OpenAI-compatible HTTP credentials for chat and embeddings. */
export type OpenAiProviderCredentials = {
	readonly apiKey?: string;
	readonly baseURL?: string;
};
