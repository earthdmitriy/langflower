/**
 * Top-level `LangflowerConfig.model` is OpenCode-style `providerId/modelId`.
 * Settings UI and runtime fallback split/join that composite.
 */

export type DefaultChatModelParts = {
	readonly providerId: string;
	readonly model: string;
};

/** First `/` splits provider vs model; both parts must be non-empty. */
export const parseDefaultChatModel = (
	model: string | undefined,
): DefaultChatModelParts | null => {
	if (typeof model !== 'string') {
		return null;
	}
	const trimmed = model.trim();
	const slash = trimmed.indexOf('/');
	if (slash <= 0 || slash >= trimmed.length - 1) {
		return null;
	}
	const providerId = trimmed.slice(0, slash).trim();
	const modelId = trimmed.slice(slash + 1).trim();
	if (providerId.length === 0 || modelId.length === 0) {
		return null;
	}
	return { providerId, model: modelId };
};

/** Compose disk/wire `model` value; omit when either part is empty. */
export const formatDefaultChatModel = (
	providerId: string,
	model: string,
): string | undefined => {
	const provider = providerId.trim();
	const modelId = model.trim();
	if (provider.length === 0 || modelId.length === 0) {
		return undefined;
	}
	return `${provider}/${modelId}`;
};

/** Inspector empty-option title when a default is configured. */
export const defaultChatModelEmptyTitle = (
	model: string | undefined,
): string | null => {
	const parts = parseDefaultChatModel(model);
	if (parts === null) {
		return null;
	}
	return `Default (${parts.providerId}/${parts.model})`;
};
