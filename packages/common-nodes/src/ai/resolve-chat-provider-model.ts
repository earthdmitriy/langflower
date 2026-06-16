/**
 * Resolve chat provider/model from node params with optional host default
 * (`LangflowerConfig.model` parsed into {@link RunHostServices.defaultChat}).
 */
import type { RunHostServices } from './run-host-services.js';

export type ResolvedChatProviderModel = {
	readonly providerId: string;
	readonly model: string;
};

export const resolveChatProviderModel = (
	params: Readonly<Record<string, unknown>>,
	host: RunHostServices | undefined,
): ResolvedChatProviderModel => {
	const fromParamsProvider = String(params['providerId'] ?? '').trim();
	const fromParamsModel = String(params['model'] ?? '').trim();
	return {
		providerId: fromParamsProvider || host?.defaultChat?.providerId || '',
		model: fromParamsModel || host?.defaultChat?.model || '',
	};
};
