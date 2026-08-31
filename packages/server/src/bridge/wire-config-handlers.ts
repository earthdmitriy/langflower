import type { Subscription } from 'rxjs';
import type {
	LangflowerConfig,
	LangflowerConfigDraftDiscardRequestedPayload,
	LangflowerConfigDraftPatchRequestedPayload,
	LangflowerConfigSaveRequestedPayload,
	LangflowerSecretsSaveRequestedPayload,
	SettingsDraft,
} from '@langflower/shared/langflower.js';
import { resolveServerLogsEnabled } from '@langflower/shared/langflower.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { buildLangflowerConfigSnapshot } from './build-langflower-config-snapshot.js';
import { bridgeEmit } from './bridge-outbound.js';
import { isInboundEvent } from './inbound-guards.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';
import { broadcastModelsCatalog } from './push-models-catalog.js';
import type { SettingsDraftController } from './settings-draft-controller.js';

const isConfigScope = (
	value: unknown,
): value is LangflowerConfigSaveRequestedPayload['scope'] =>
	value === 'project' || value === 'global';

const isSettingsDraft = (value: unknown): value is SettingsDraft => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const draft = value as Record<string, unknown>;
	return (
		typeof draft['defaultProviderId'] === 'string' &&
		typeof draft['defaultModelId'] === 'string' &&
		typeof draft['defaultEmbeddingProviderId'] === 'string' &&
		typeof draft['defaultEmbeddingModelId'] === 'string' &&
		Array.isArray(draft['providers']) &&
		(draft['secrets'] === undefined || Array.isArray(draft['secrets'])) &&
		(draft['serverLogs'] === 'off' ||
			draft['serverLogs'] === 'default' ||
			draft['serverLogs'] === 'on')
	);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isSecretsSavePayload = (
	value: unknown,
): value is LangflowerSecretsSaveRequestedPayload => {
	if (!isRecord(value)) {
		return false;
	}

	if (
		value.secretIds !== undefined &&
		(!Array.isArray(value.secretIds) ||
			value.secretIds.some((id) => typeof id !== 'string'))
	) {
		return false;
	}

	if (value.secretValues !== undefined && !isRecord(value.secretValues)) {
		return false;
	}

	return true;
};

export type WireConfigHandlersOptions = {
	readonly onEffectiveConfig?: (config: LangflowerConfig) => void;
};

export const wireConfigHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
	_session: LangflowerSession,
	draftController: SettingsDraftController,
	options: WireConfigHandlersOptions = {},
): Subscription => {
	const subscription = bridge['langflower.config.save.requested'].subscribe(
		async (raw) => {
			if (
				!isInboundEvent<LangflowerConfigSaveRequestedPayload>(raw) ||
				!isConfigScope(raw.payload.scope)
			) {
				return;
			}

			const effective = await draftController.commitSave(
				raw.payload.scope,
				raw.payload,
			);
			if (effective === null) {
				return;
			}

			options.onEffectiveConfig?.(effective);
			await broadcastModelsCatalog(bridge, context);
		},
	);

	subscription.add(
		bridge['langflower.secrets.save.requested'].subscribe(async (raw) => {
			if (
				!isInboundEvent<LangflowerSecretsSaveRequestedPayload>(raw) ||
				!isSecretsSavePayload(raw.payload)
			) {
				return;
			}

			await context.langflowerConfigService.writeSecrets({
				...(raw.payload.secretIds !== undefined
					? { secretIds: raw.payload.secretIds }
					: {}),
				...(raw.payload.secretValues !== undefined
					? { secretValues: raw.payload.secretValues }
					: {}),
			});
			await draftController.syncGlobalSecrets();
			const snapshot = await buildLangflowerConfigSnapshot(context);
			bridgeEmit(bridge, 'langflower.config.snapshot', snapshot);
		}),
	);

	subscription.add(
		bridge['langflower.config.draft.patch.requested'].subscribe(
			async (raw) => {
				if (
					!isInboundEvent<LangflowerConfigDraftPatchRequestedPayload>(
						raw,
					) ||
					!isConfigScope(raw.payload.scope) ||
					!isSettingsDraft(raw.payload.draft)
				) {
					return;
				}

				await draftController.patch(
					raw.payload.scope,
					raw.payload.draft,
				);
			},
		),
	);

	subscription.add(
		bridge['langflower.config.draft.discard.requested'].subscribe(
			async (raw) => {
				if (
					!isInboundEvent<LangflowerConfigDraftDiscardRequestedPayload>(
						raw,
					) ||
					!isConfigScope(raw.payload.scope)
				) {
					return;
				}

				await draftController.discard(raw.payload.scope);
			},
		),
	);

	return subscription;
};

export const applyServerLogsGate = (
	setEnabled: (enabled: boolean) => void,
	config: LangflowerConfig,
): void => {
	setEnabled(resolveServerLogsEnabled(config));
};
