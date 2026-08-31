/**
 * Settings form draft helpers — layer config ↔ draft, save payload, equality.
 * Used by UI and server session draft (Settings snapshots redact apiKey /
 * secret values). Runtime provider keys stay on the server via
 * `resolveProviderCredentials` — not this form type.
 */
import {
	formatDefaultChatModel,
	parseDefaultChatModel,
} from './parse-default-chat-model.js';
import type {
	LangflowerConfig,
	LangflowerConfigSaveRequestedPayload,
	LangflowerConfigScope,
	LangflowerProviderConfig,
	LangflowerSecretsSaveRequestedPayload,
} from '../types/langflower-config.js';

export type ProviderDraft = {
	readonly id: string;
	readonly name: string;
	readonly baseURL: string;
	readonly modelsText: string;
	/** Write-only Settings field; snapshots send ''. Persist via Save. */
	readonly apiKey: string;
	readonly hasApiKey: boolean;
};

/** Named KV row in Settings Global. Snapshots send empty `value`. */
export type SecretDraft = {
	readonly id: string;
	/** Write-only Settings field; snapshots send ''. Persist via secrets.save. */
	readonly value: string;
	readonly hasValue: boolean;
};

/** Tri-state for scoped `serverLogs` (Default = key omitted). */
export type ServerLogsDraft = 'off' | 'default' | 'on';

export type SettingsDraft = {
	/** Split from disk `model: "provider/model"` for Settings selects. */
	readonly defaultProviderId: string;
	readonly defaultModelId: string;
	/** Split from disk `embedding: "provider/model"` for Settings selects. */
	readonly defaultEmbeddingProviderId: string;
	readonly defaultEmbeddingModelId: string;
	readonly providers: readonly ProviderDraft[];
	readonly secrets: readonly SecretDraft[];
	readonly serverLogs: ServerLogsDraft;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const providerBaseURL = (provider: LangflowerProviderConfig): string => {
	const options = provider['options'];
	if (!isRecord(options)) {
		return '';
	}
	return typeof options['baseURL'] === 'string' ? options['baseURL'] : '';
};

const providerHasApiKey = (provider: LangflowerProviderConfig): boolean =>
	provider['hasApiKey'] === true;

export const configToDraft = (config: LangflowerConfig): SettingsDraft => {
	const providers = Object.entries(config.provider ?? {}).map(
		([id, provider]) => ({
			id,
			name: provider.name,
			baseURL: providerBaseURL(provider),
			modelsText: (provider.models ?? []).join(', '),
			apiKey: '',
			hasApiKey: providerHasApiKey(provider),
		}),
	);

	const serverLogs: ServerLogsDraft =
		config.serverLogs === true
			? 'on'
			: config.serverLogs === false
				? 'off'
				: 'default';

	const parts = parseDefaultChatModel(config.model);
	const embeddingParts = parseDefaultChatModel(config.embedding);

	return {
		defaultProviderId: parts?.providerId ?? '',
		defaultModelId: parts?.model ?? '',
		defaultEmbeddingProviderId: embeddingParts?.providerId ?? '',
		defaultEmbeddingModelId: embeddingParts?.model ?? '',
		providers,
		secrets: [],
		serverLogs,
	};
};

/**
 * Seed write-only secret rows from stored ids (never values).
 */
export const secretsDraftFromIds = (
	ids: readonly string[],
): readonly SecretDraft[] =>
	ids
		.map((id) => id.trim())
		.filter((id) => id.length > 0)
		.map((id) => ({ id, value: '', hasValue: true }));

/** Snapshot-safe draft — never echo provider keys or KV secret values. */
export const redactDraftSecrets = (draft: SettingsDraft): SettingsDraft => ({
	...draft,
	providers: draft.providers.map((row) => ({
		...row,
		apiKey: '',
	})),
	secrets: (draft.secrets ?? []).map((row) => ({
		...row,
		value: '',
	})),
});

const parseModelsText = (text: string): readonly string[] =>
	text
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

const serverLogsToSave = (draft: ServerLogsDraft): boolean | null => {
	if (draft === 'on') {
		return true;
	}
	if (draft === 'off') {
		return false;
	}
	return null;
};

export const draftToSavePayload = (
	scope: LangflowerConfigScope,
	draft: SettingsDraft,
): LangflowerConfigSaveRequestedPayload & {
	readonly provider: Readonly<Record<string, LangflowerProviderConfig>>;
	readonly providerApiKeys: Readonly<Record<string, string>>;
	readonly serverLogs: boolean | null;
} => {
	const providerApiKeys = Object.fromEntries(
		draft.providers
			.filter((row) => row.apiKey.trim().length > 0)
			.map((row) => [row.id.trim(), row.apiKey.trim()]),
	);

	const provider = Object.fromEntries(
		draft.providers
			.filter((row) => row.id.trim().length > 0)
			.map((row): [string, LangflowerProviderConfig] => {
				const models = parseModelsText(row.modelsText);
				const baseURL = row.baseURL.trim();
				return [
					row.id.trim(),
					{
						name: row.name.trim() || row.id.trim(),
						...(models.length > 0 ? { models } : {}),
						...(baseURL.length > 0 ? { options: { baseURL } } : {}),
					},
				];
			}),
	);

	// Always send `model` / `embedding` so clearing the selects removes them
	// from the layer (omit would leave the previous disk value — Save looked
	// like a no-op).
	const model =
		formatDefaultChatModel(draft.defaultProviderId, draft.defaultModelId) ??
		'';
	const embedding =
		formatDefaultChatModel(
			draft.defaultEmbeddingProviderId,
			draft.defaultEmbeddingModelId,
		) ?? '';

	return {
		scope,
		model,
		embedding,
		provider,
		providerApiKeys,
		serverLogs: serverLogsToSave(draft.serverLogs),
	};
};

/**
 * Global Save payload for `langflower.secrets.save.requested`.
 * `secretIds` is the surviving set; only non-empty `value`s become
 * `secretValues`.
 */
export const draftToSecretsSavePayload = (
	draft: SettingsDraft,
): LangflowerSecretsSaveRequestedPayload => {
	const secretIds = draft.secrets
		.map((row) => row.id.trim())
		.filter((id) => id.length > 0);
	const secretValues = Object.fromEntries(
		draft.secrets.flatMap((row) => {
			const id = row.id.trim();
			const value = row.value.trim();
			return id.length > 0 && value.length > 0 ? [[id, value]] : [];
		}),
	);
	return { secretIds, secretValues };
};

export const sameDraft = (a: SettingsDraft, b: SettingsDraft): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

/**
 * Merge an incoming patch draft into the session draft while preserving
 * write-only apiKey values when the patch sends an empty key field.
 */
export const mergeDraftPatch = (
	previous: SettingsDraft,
	patch: SettingsDraft,
): SettingsDraft => ({
	...patch,
	secrets: (patch.secrets ?? previous.secrets ?? []).map((row, index) => {
		const prior = previous.secrets?.[index];
		const incoming = row.value.trim();
		if (incoming.length > 0) {
			return row;
		}
		return {
			...row,
			value: prior?.value ?? '',
		};
	}),
	providers: patch.providers.map((row, index) => {
		const prior = previous.providers[index];
		const incomingKey = row.apiKey.trim();
		if (incomingKey.length > 0) {
			return row;
		}
		return {
			...row,
			apiKey: prior?.apiKey ?? '',
		};
	}),
});

/**
 * After a saved-layer baseline refresh:
 * - pristine form → take the layer draft (apiKey always empty);
 * - dirty form → clear write-only `apiKey`, refresh `hasApiKey` from the
 *   layer, then fully align when non-secret fields already match (post-Save).
 */
export const draftAfterLayerSnapshot = (
	previousDraft: SettingsDraft,
	previousBaseline: SettingsDraft,
	nextBaseline: SettingsDraft,
): SettingsDraft => {
	if (sameDraft(previousDraft, previousBaseline)) {
		return nextBaseline;
	}

	const cleared: SettingsDraft = {
		...previousDraft,
		providers: previousDraft.providers.map((row) => {
			const fromLayer = nextBaseline.providers.find(
				(provider) => provider.id === row.id,
			);
			return {
				...row,
				apiKey: '',
				hasApiKey: fromLayer?.hasApiKey ?? false,
			};
		}),
		secrets: (previousDraft.secrets ?? []).map((row) => {
			const fromLayer = nextBaseline.secrets?.find(
				(secret) => secret.id === row.id,
			);
			return {
				...row,
				value: '',
				hasValue: fromLayer?.hasValue ?? false,
			};
		}),
	};

	return sameDraft(cleared, nextBaseline) ? nextBaseline : cleared;
};

/** Static model ids from the provider row matching `providerId`. */
export const staticModelIdsForProvider = (
	draft: SettingsDraft,
	providerId: string,
): readonly string[] => {
	const id = providerId.trim();
	if (id.length === 0) {
		return [];
	}
	const row = draft.providers.find((provider) => provider.id === id);
	if (row === undefined) {
		return [];
	}
	return parseModelsText(row.modelsText);
};

/** Static model ids from the provider row matching `defaultProviderId`. */
export const defaultProviderStaticModelIds = (
	draft: SettingsDraft,
): readonly string[] =>
	staticModelIdsForProvider(draft, draft.defaultProviderId);

/** Row key for connections map (stable for empty ids). */
export const providerConnectionKey = (index: number): string => String(index);
