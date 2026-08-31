/**
 * In-memory Settings draft per scope (session memory, not disk).
 */
import type {
	LangflowerConfig,
	LangflowerConfigDraftSnapshotPayload,
	LangflowerConfigScope,
	ProviderConnectionStatus,
	SettingsDraft,
} from '@langflower/shared/langflower.js';
import {
	configToDraft,
	mergeDraftPatch,
	providerConnectionKey,
	redactDraftSecrets,
	sameDraft,
	secretsDraftFromIds,
} from '@langflower/shared/langflower.js';

export type ScopeSettingsDraft = {
	readonly draft: SettingsDraft;
	readonly baseline: SettingsDraft;
	readonly connections: Readonly<Record<string, ProviderConnectionStatus>>;
};

export type SettingsDraftStore = {
	project: ScopeSettingsDraft | undefined;
	global: ScopeSettingsDraft | undefined;
};

export const emptySettingsDraftStore = (): SettingsDraftStore => ({
	project: undefined,
	global: undefined,
});

export const idleConnectionsForDraft = (
	draft: SettingsDraft,
): Readonly<Record<string, ProviderConnectionStatus>> =>
	Object.fromEntries(
		draft.providers.map((_, index) => [
			providerConnectionKey(index),
			{ state: 'idle' as const },
		]),
	);

/**
 * Initial connection map after seeding from disk: rows with a Base URL start
 * as `checking` so the UI does not show the empty-URL hint until a probe runs.
 */
const initialConnectionsForDraft = (
	draft: SettingsDraft,
): Readonly<Record<string, ProviderConnectionStatus>> =>
	Object.fromEntries(
		draft.providers.map((row, index) => [
			providerConnectionKey(index),
			row.baseURL.trim().length > 0
				? ({ state: 'checking' } as const)
				: ({ state: 'idle' } as const),
		]),
	);

export const seedScopeDraft = (
	layerConfig: LangflowerConfig,
	secretIds: readonly string[] = [],
): ScopeSettingsDraft => {
	const baseline: SettingsDraft = {
		...configToDraft(layerConfig),
		secrets: secretsDraftFromIds(secretIds),
	};
	return {
		draft: baseline,
		baseline,
		connections: initialConnectionsForDraft(baseline),
	};
};

/** Indexes of draft rows that should be probed (non-empty Base URL). */
export const providerIndexesWithBaseUrl = (
	draft: SettingsDraft,
): readonly number[] =>
	draft.providers.flatMap((row, index) =>
		row.baseURL.trim().length > 0 ? [index] : [],
	);

export const buildDraftSnapshot = (
	scope: LangflowerConfigScope,
	state: ScopeSettingsDraft,
): LangflowerConfigDraftSnapshotPayload => ({
	scope,
	draft: redactDraftSecrets(state.draft),
	baseline: redactDraftSecrets(state.baseline),
	dirty:
		!sameDraft(
			redactDraftSecrets(state.draft),
			redactDraftSecrets(state.baseline),
		) || state.draft.providers.some((row) => row.apiKey.trim().length > 0),
	connections: state.connections,
});

export const applyDraftPatch = (
	previous: ScopeSettingsDraft,
	incoming: SettingsDraft,
): {
	readonly next: ScopeSettingsDraft;
	readonly probeIndexes: readonly number[];
} => {
	const merged = mergeDraftPatch(previous.draft, incoming);
	const probeIndexes: number[] = [];

	const max = Math.max(
		previous.draft.providers.length,
		merged.providers.length,
	);
	for (let index = 0; index < max; index++) {
		const before = previous.draft.providers[index];
		const after = merged.providers[index];
		if (after === undefined) {
			continue;
		}
		const urlChanged = (before?.baseURL ?? '') !== after.baseURL;
		const keyChanged = (before?.apiKey ?? '') !== after.apiKey;
		if (urlChanged || keyChanged) {
			probeIndexes.push(index);
		}
	}

	const connections: Record<string, ProviderConnectionStatus> = {};
	for (let index = 0; index < merged.providers.length; index++) {
		const key = providerConnectionKey(index);
		if (probeIndexes.includes(index)) {
			const baseURL = merged.providers[index]!.baseURL.trim();
			connections[key] =
				baseURL.length === 0
					? { state: 'idle' }
					: { state: 'checking' };
		} else {
			connections[key] = previous.connections[key] ?? { state: 'idle' };
		}
	}

	return {
		next: {
			draft: merged,
			baseline: previous.baseline,
			connections,
		},
		probeIndexes: probeIndexes.filter(
			(index) => merged.providers[index]!.baseURL.trim().length > 0,
		),
	};
};

export const setConnectionStatus = (
	state: ScopeSettingsDraft,
	index: number,
	status: ProviderConnectionStatus,
): ScopeSettingsDraft => ({
	...state,
	connections: {
		...state.connections,
		[providerConnectionKey(index)]: status,
	},
});
