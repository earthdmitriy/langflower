/**
 * Resolve embedding provider/model from node params with optional host
 * default (`LangflowerConfig.embedding` parsed into
 * {@link RunHostServices.defaultEmbedding}).
 */
import type { RunHostServices } from '../ai/features/run-host-services.js';

export type ResolvedEmbeddingProviderModel = {
	readonly providerId: string;
	readonly model: string;
};

export const resolveEmbeddingProviderModel = (
	params: Readonly<Record<string, unknown>>,
	host: RunHostServices | undefined,
): ResolvedEmbeddingProviderModel => {
	const fromParamsProvider = String(params['providerId'] ?? '').trim();
	const fromParamsModel = String(params['model'] ?? '').trim();
	return {
		providerId:
			fromParamsProvider || host?.defaultEmbedding?.providerId || '',
		model: fromParamsModel || host?.defaultEmbedding?.model || '',
	};
};
