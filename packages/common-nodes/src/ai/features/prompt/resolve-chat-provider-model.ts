/**
 * Resolve chat provider/model from node params with optional host default
 * (`LangflowerConfig.model` parsed into promptContext `defaultChat`).
 */

export type ResolvedChatProviderModel = {
	readonly providerId: string;
	readonly model: string;
};

export const resolveChatProviderModel = (
	params: Readonly<Record<string, unknown>>,
	defaultChat?: {
		readonly providerId: string;
		readonly model: string;
	},
): ResolvedChatProviderModel => {
	const fromParamsProvider = String(params['providerId'] ?? '').trim();
	const fromParamsModel = String(params['model'] ?? '').trim();
	return {
		providerId: fromParamsProvider || defaultChat?.providerId || '',
		model: fromParamsModel || defaultChat?.model || '',
	};
};
