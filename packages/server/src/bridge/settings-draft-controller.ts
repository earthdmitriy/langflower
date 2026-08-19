/**
 * Session Settings draft: seed, patch, discard, save commit, connection probe.
 */
import { listProviderModels as listOpenAiProviderModels } from '@langflower/common-nodes/ai/openai/list-provider-models';
import type {
	LangflowerConfig,
	LangflowerConfigDraftSnapshotPayload,
	LangflowerConfigSaveRequestedPayload,
	LangflowerConfigScope,
	ProviderConnectionStatus,
	SettingsDraft,
} from '@langflower/shared/langflower.js';
import {
	draftToSavePayload,
	mergeLangflowerConfigLayers,
} from '@langflower/shared/langflower.js';
import { resolveDraftProviderCredentials } from '../config/resolve-draft-provider-credentials.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import {
	applyDraftPatch,
	buildDraftSnapshot,
	providerIndexesWithBaseUrl,
	seedScopeDraft,
	setConnectionStatus,
	type ScopeSettingsDraft,
} from '../session/settings-draft-session.js';
import { bridgeEmit, clientEmit } from './bridge-outbound.js';
import type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';
import { buildLangflowerConfigSnapshot } from './build-langflower-config-snapshot.js';

const isScope = (value: unknown): value is LangflowerConfigScope =>
	value === 'project' || value === 'global';

/** Fill missing/empty Save keys from the session draft (write-only apiKey). */
const mergeProviderApiKeysFromSession = (
	payload: LangflowerConfigSaveRequestedPayload,
	sessionDraft: SettingsDraft | undefined,
): Readonly<Record<string, string>> | undefined => {
	if (payload.provider === undefined || sessionDraft === undefined) {
		return payload.providerApiKeys;
	}

	const merged: Record<string, string> = {
		...(payload.providerApiKeys ?? {}),
	};

	for (const row of sessionDraft.providers) {
		const id = row.id.trim();
		if (id.length === 0) {
			continue;
		}
		const fromPayload = merged[id]?.trim() ?? '';
		if (fromPayload.length > 0) {
			continue;
		}
		const pending = row.apiKey.trim();
		if (pending.length > 0) {
			merged[id] = pending;
		}
	}

	return Object.keys(merged).length > 0 ? merged : payload.providerApiKeys;
};

const layerForScope = (
	layers: {
		readonly project: LangflowerConfig;
		readonly global: LangflowerConfig;
	},
	scope: LangflowerConfigScope,
): LangflowerConfig => (scope === 'project' ? layers.project : layers.global);

export type SettingsDraftController = {
	readonly ensureSeeded: (scope: LangflowerConfigScope) => Promise<void>;
	readonly snapshotFor: (
		scope: LangflowerConfigScope,
	) => Promise<LangflowerConfigDraftSnapshotPayload | null>;
	readonly broadcast: (scope: LangflowerConfigScope) => Promise<void>;
	readonly pushToClient: (
		client: LangflowerClient,
		scope: LangflowerConfigScope,
	) => Promise<void>;
	readonly patch: (
		scope: LangflowerConfigScope,
		draft: SettingsDraft,
	) => Promise<void>;
	readonly discard: (scope: LangflowerConfigScope) => Promise<void>;
	readonly commitSave: (
		scope: LangflowerConfigScope,
		fallback?: LangflowerConfigSaveRequestedPayload,
	) => Promise<LangflowerConfig | null>;
};

export const createSettingsDraftController = (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
): SettingsDraftController => {
	const probeGeneration = new Map<string, number>();

	const getState = (
		scope: LangflowerConfigScope,
	): ScopeSettingsDraft | undefined =>
		scope === 'project'
			? session.settingsDraft.project
			: session.settingsDraft.global;

	const setState = (
		scope: LangflowerConfigScope,
		state: ScopeSettingsDraft,
	): void => {
		if (scope === 'project') {
			session.settingsDraft.project = state;
		} else {
			session.settingsDraft.global = state;
		}
	};

	/** Emit current session draft — never re-enters ensureSeeded/probe. */
	const emitCurrent = (scope: LangflowerConfigScope): void => {
		const state = getState(scope);
		if (state === undefined) {
			return;
		}
		bridgeEmit(
			bridge,
			'langflower.config.draft.snapshot',
			buildDraftSnapshot(scope, state),
		);
	};

	const runProbe = async (
		scope: LangflowerConfigScope,
		index: number,
	): Promise<void> => {
		const key = `${scope}:${index}`;
		const generation = (probeGeneration.get(key) ?? 0) + 1;
		probeGeneration.set(key, generation);

		const state = getState(scope);
		const row = state?.draft.providers[index];
		if (state === undefined || row === undefined) {
			return;
		}

		const baseURL = row.baseURL.trim();
		if (baseURL.length === 0) {
			setState(
				scope,
				setConnectionStatus(state, index, { state: 'idle' }),
			);
			emitCurrent(scope);
			return;
		}

		setState(
			scope,
			setConnectionStatus(state, index, { state: 'checking' }),
		);
		emitCurrent(scope);

		const layers = await context.langflowerConfigService.readLayers();
		const savedLayer = layerForScope(layers, scope);
		const resolved = resolveDraftProviderCredentials(row, savedLayer);

		let status: ProviderConnectionStatus;
		if (!resolved.ok) {
			status = { state: 'error', message: resolved.message };
		} else {
			const listed = await listOpenAiProviderModels(resolved.credentials);
			status =
				listed.error !== undefined
					? { state: 'error', message: listed.error }
					: { state: 'ok', modelCount: listed.models.length };
		}

		if (probeGeneration.get(key) !== generation) {
			return;
		}

		const latest = getState(scope);
		if (
			latest === undefined ||
			latest.draft.providers[index] === undefined
		) {
			return;
		}

		setState(scope, setConnectionStatus(latest, index, status));
		emitCurrent(scope);
	};

	const probeProvidersWithUrl = (
		scope: LangflowerConfigScope,
		draft: SettingsDraft,
	): void => {
		for (const index of providerIndexesWithBaseUrl(draft)) {
			void runProbe(scope, index);
		}
	};

	const ensureSeeded = async (
		scope: LangflowerConfigScope,
	): Promise<void> => {
		if (getState(scope) !== undefined) {
			return;
		}
		const layers = await context.langflowerConfigService.readLayers();
		const seeded = seedScopeDraft(layerForScope(layers, scope));
		setState(scope, seeded);
		// Seed leaves URL rows as `checking`; kick probes so launch shows
		// Connected/error without requiring an edit first.
		probeProvidersWithUrl(scope, seeded.draft);
	};

	const snapshotFor = async (
		scope: LangflowerConfigScope,
	): Promise<LangflowerConfigDraftSnapshotPayload | null> => {
		await ensureSeeded(scope);
		const state = getState(scope);
		if (state === undefined) {
			return null;
		}
		return buildDraftSnapshot(scope, state);
	};

	const broadcast = async (scope: LangflowerConfigScope): Promise<void> => {
		await ensureSeeded(scope);
		emitCurrent(scope);
	};

	const pushToClient = async (
		client: LangflowerClient,
		scope: LangflowerConfigScope,
	): Promise<void> => {
		const snapshot = await snapshotFor(scope);
		if (snapshot === null) {
			return;
		}
		clientEmit(client, 'langflower.config.draft.snapshot', snapshot);
	};

	const patch = async (
		scope: LangflowerConfigScope,
		draft: SettingsDraft,
	): Promise<void> => {
		await ensureSeeded(scope);
		const previous = getState(scope);
		if (previous === undefined) {
			return;
		}

		const { next, probeIndexes } = applyDraftPatch(previous, draft);
		setState(scope, next);
		emitCurrent(scope);

		for (const index of probeIndexes) {
			void runProbe(scope, index);
		}
	};

	const discard = async (scope: LangflowerConfigScope): Promise<void> => {
		const layers = await context.langflowerConfigService.readLayers();
		const seeded = seedScopeDraft(layerForScope(layers, scope));
		setState(scope, seeded);
		emitCurrent(scope);
		probeProvidersWithUrl(scope, seeded.draft);
	};

	const commitSave = async (
		scope: LangflowerConfigScope,
		fallback?: LangflowerConfigSaveRequestedPayload,
	): Promise<LangflowerConfig | null> => {
		await ensureSeeded(scope);
		const state = getState(scope);
		// Prefer an explicit Save payload (provider/model/embedding/serverLogs)
		// so a trailing draft.patch cannot race past commit. Otherwise persist
		// the session draft (`{ scope }` only).
		const payload =
			fallback !== undefined &&
			(fallback.provider !== undefined ||
				fallback.model !== undefined ||
				fallback.embedding !== undefined ||
				'serverLogs' in fallback)
				? fallback
				: state !== undefined
					? draftToSavePayload(scope, state.draft)
					: fallback;

		if (payload === undefined || !isScope(payload.scope)) {
			return null;
		}

		const providerApiKeys = mergeProviderApiKeysFromSession(
			payload,
			state?.draft,
		);

		const layers = await context.langflowerConfigService.writeSettings({
			scope: payload.scope,
			...(payload.model !== undefined ? { model: payload.model } : {}),
			...(payload.embedding !== undefined
				? { embedding: payload.embedding }
				: {}),
			...(payload.provider !== undefined
				? { provider: payload.provider }
				: {}),
			...(providerApiKeys !== undefined ? { providerApiKeys } : {}),
			...('serverLogs' in payload
				? { serverLogs: payload.serverLogs }
				: {}),
		});

		const layer = layerForScope(layers, scope);
		const seeded = seedScopeDraft(layer);
		setState(scope, seeded);

		const snapshot = await buildLangflowerConfigSnapshot(context);
		bridgeEmit(bridge, 'langflower.config.snapshot', snapshot);
		emitCurrent(scope);
		probeProvidersWithUrl(scope, seeded.draft);

		return mergeLangflowerConfigLayers(layers.global, layers.project);
	};

	return {
		ensureSeeded,
		snapshotFor,
		broadcast,
		pushToClient,
		patch,
		discard,
		commitSave,
	};
};
