/**
 * Resolve embedding provider/model from node params with optional host
 * default (`LangflowerConfig.embedding` parsed into embed `defaultEmbedding`).
 */

export type ResolvedEmbeddingProviderModel = {
	readonly providerId: string;
	readonly model: string;
};

export const resolveEmbeddingProviderModel = (
	params: Readonly<Record<string, unknown>>,
	defaultEmbedding?: {
		readonly providerId: string;
		readonly model: string;
	},
): ResolvedEmbeddingProviderModel => {
	const fromParamsProvider = String(params['providerId'] ?? '').trim();
	const fromParamsModel = String(params['model'] ?? '').trim();
	return {
		providerId: fromParamsProvider || defaultEmbedding?.providerId || '',
		model: fromParamsModel || defaultEmbedding?.model || '',
	};
};
