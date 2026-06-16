import type {
	LangflowerConfig,
	LangflowerProviderConfig,
} from '@langflower/shared/langflower.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const providerHasApiKey = (provider: LangflowerProviderConfig): boolean => {
	if (!('options' in provider) || !isRecord(provider.options)) {
		return false;
	}

	const apiKey = provider.options.apiKey;
	return typeof apiKey === 'string' && apiKey.length > 0;
};

const redactProviderOptions = (
	provider: LangflowerProviderConfig,
): LangflowerProviderConfig => {
	const hasApiKey = providerHasApiKey(provider);

	if (!('options' in provider) || !isRecord(provider.options)) {
		return hasApiKey ? { ...provider, hasApiKey: true } : provider;
	}

	const { apiKey: _apiKey, ...safeOptions } = provider.options;

	if (Object.keys(safeOptions).length === 0) {
		const { options: _options, ...rest } = provider;
		return hasApiKey
			? ({ ...rest, hasApiKey: true } as LangflowerProviderConfig)
			: (rest as LangflowerProviderConfig);
	}

	return {
		...provider,
		options: safeOptions,
		...(hasApiKey ? { hasApiKey: true } : {}),
	};
};

/**
 * Strips secret-bearing fields from project config before WebSocket snapshots.
 * Omits `provider.*.options.apiKey` (literal or `{env:…}`); UI keeps `name` +
 * `models` and non-secret options such as `baseURL`. Sets `hasApiKey` when a
 * secret was present so Settings can show write-only placeholders.
 */
export const redactLangflowerConfigForBridge = (
	config: LangflowerConfig,
): LangflowerConfig => {
	if (config.provider === undefined) {
		return config;
	}

	const provider = Object.fromEntries(
		Object.entries(config.provider).map(([id, entry]) => [
			id,
			redactProviderOptions(entry),
		]),
	);

	return { ...config, provider };
};
