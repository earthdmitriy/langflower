import type { LangflowerModelsCatalogSnapshotPayload } from '@langflower/shared/langflower.js';
import type { ServerContext } from '../server-context.js';
import { listProviderModels } from './bind-llm-context.js';
import { bridgeEmit, clientEmit } from './bridge-outbound.js';
import type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';

/**
 * Build the authoritative live model catalog for every configured provider.
 * Uses the same credential resolve path as chat; never throws.
 */
export const buildModelsCatalogSnapshot = async (
	context: ServerContext,
): Promise<LangflowerModelsCatalogSnapshotPayload> => {
	const config = await context.langflowerConfigService.read();
	const providerIds = Object.keys(config.provider ?? {});

	const entries = await Promise.all(
		providerIds.map(async (providerId) => {
			const result = await listProviderModels(
				context.langflowerConfigService,
				providerId,
			);

			return [
				providerId,
				{
					models: result.models,
					...(result.error !== undefined
						? { error: result.error }
						: {}),
				},
			] as const;
		}),
	);

	return { catalogs: Object.fromEntries(entries) };
};

/** Unicast catalog to one connecting client (bootstrap). */
export const pushModelsCatalogToClient = async (
	client: LangflowerClient,
	context: ServerContext,
): Promise<void> => {
	clientEmit(
		client,
		'langflower.models.catalog.snapshot',
		await buildModelsCatalogSnapshot(context),
	);
};

/** Broadcast catalog to all tabs (after Settings Save). */
export const broadcastModelsCatalog = async (
	bridge: LangflowerBridge,
	context: ServerContext,
): Promise<void> => {
	bridgeEmit(
		bridge,
		'langflower.models.catalog.snapshot',
		await buildModelsCatalogSnapshot(context),
	);
};
