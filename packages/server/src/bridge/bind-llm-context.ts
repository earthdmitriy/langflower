import {
	createChatCompletionStream,
	type CreateChatCompletionStream,
	type OpenAiProviderCredentials,
} from '@langflower/common-nodes/ai/openai/create-chat-completion-stream';
import { listProviderModels as listOpenAiProviderModels } from '@langflower/common-nodes/ai/openai/list-provider-models';
import type { ProviderModelEntry } from '@langflower/shared/langflower.js';
import type { LangflowerConfigService } from '../config/langflower-config.service.js';
import { resolveProviderCredentials } from '../config/resolve-provider-credentials.js';

/**
 * Thin credential bind: secrets stay server-side; OpenAI adapters live in
 * common-nodes.
 */
export const bindCreateChatCompletionStream = (
	langflowerConfigService: LangflowerConfigService,
): CreateChatCompletionStream =>
	createChatCompletionStream({
		resolveProvider: async (providerId) => {
			const config = await langflowerConfigService.read();
			const resolved = resolveProviderCredentials(config, providerId);

			if (!resolved.ok) {
				throw new Error(resolved.message);
			}

			return resolved.credentials;
		},
	});

export type ListProviderModelsResult = {
	readonly models: readonly ProviderModelEntry[];
	readonly error?: string;
};

export const listProviderModels = async (
	langflowerConfigService: LangflowerConfigService,
	providerId: string,
): Promise<ListProviderModelsResult> => {
	const config = await langflowerConfigService.read();
	const resolved = resolveProviderCredentials(config, providerId);

	if (!resolved.ok) {
		return { models: [], error: resolved.message };
	}

	const credentials: OpenAiProviderCredentials = resolved.credentials;
	const result = await listOpenAiProviderModels(credentials);

	return {
		models: result.models,
		...(result.error !== undefined ? { error: result.error } : {}),
	};
};
