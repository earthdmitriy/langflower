import type { InlineSelectOption } from '@langflower/node-sdk';
import type { ProviderModelEntry } from '../types/langflower-config.js';

/**
 * Union of static jsonc model ids and live-fetched catalog entries (dedupe by id).
 * Fetched `name` wins over static id-only titles when both exist.
 */
export const mergeProviderModelOptions = (
	staticModelIds: readonly string[] | undefined,
	fetchedModels: readonly ProviderModelEntry[] | undefined,
): readonly InlineSelectOption[] => {
	const byId = new Map<string, InlineSelectOption>();

	for (const id of staticModelIds ?? []) {
		byId.set(id, { value: id, title: id });
	}

	for (const model of fetchedModels ?? []) {
		byId.set(model.id, {
			value: model.id,
			title: model.name ?? model.id,
		});
	}

	return [...byId.values()];
};
