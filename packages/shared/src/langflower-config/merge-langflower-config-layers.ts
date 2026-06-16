import type { LangflowerConfig } from '../types/langflower-config.js';

/**
 * Merge global then project — project wins for overlapping top-level fields
 * and for the same provider id (full provider entry replace).
 */
export const mergeLangflowerConfigLayers = (
	globalConfig: LangflowerConfig,
	projectConfig: LangflowerConfig,
): LangflowerConfig => {
	const provider =
		globalConfig.provider === undefined &&
		projectConfig.provider === undefined
			? undefined
			: {
					...(globalConfig.provider ?? {}),
					...(projectConfig.provider ?? {}),
				};

	return {
		...globalConfig,
		...projectConfig,
		...(provider !== undefined ? { provider } : {}),
	};
};
