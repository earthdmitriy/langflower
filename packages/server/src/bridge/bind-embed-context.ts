import {
	createEmbedding,
	type CreateEmbedding,
} from '@langflower/common-nodes/embeddings/create-embedding';
import type { LangflowerConfigService } from '../config/langflower-config.service.js';
import { resolveProviderCredentials } from '../config/resolve-provider-credentials.js';

/**
 * Thin credential bind: secrets stay server-side; embeddings HTTP lives in
 * common-nodes.
 */
export const bindCreateEmbedding = (
	langflowerConfigService: LangflowerConfigService,
): CreateEmbedding =>
	createEmbedding({
		resolveProvider: async (providerId) => {
			const config = await langflowerConfigService.read();
			const resolved = resolveProviderCredentials(config, providerId);

			if (!resolved.ok) {
				throw new Error(resolved.message);
			}

			return resolved.credentials;
		},
	});
