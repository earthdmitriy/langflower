import type { InlineSelectOption } from '@langflower/node-sdk';
import type { UISchemaConstItem } from '@langflower/node-sdk/create-typed-ui-schema';
import type { LangflowerConfig } from '../types/langflower-config.js';
import { resolveMcpServerOptions } from './resolve-wired-tool-options.js';

/**
 * Resolves a uiSchema item's `optionsSource` into concrete `select` /
 * `multiselect` choices for the Inspector panel — reuses
 * {@link InlineSelectOption} from `@langflower/node-sdk`, no
 * parallel option type.
 *
 * Pure projection of already-delivered {@link LangflowerConfig}; no I/O.
 * Does **not** resolve `node.wiredTools` — that needs the persisted graph;
 * call {@link resolveEnabledToolOptions} / {@link resolveWiredToolOptions}
 * from `resolve-wired-tool-options.ts` instead.
 *
 * Extend by adding a literal to `UISchemaConstItem['optionsSource']` and a
 * case here (exhaustive switch — the compiler enforces the new case).
 */
export const resolveUiSchemaOptions = (
	config: LangflowerConfig,
	item: Pick<UISchemaConstItem, 'optionsSource' | 'dependsOn' | 'options'>,
	currentParams: Readonly<Record<string, unknown>>,
): readonly InlineSelectOption[] => {
	if (item.options !== undefined) {
		return item.options;
	}

	const source = item.optionsSource;

	switch (source) {
		case 'langflower.providers':
			return Object.entries(config.provider ?? {}).map(
				([id, provider]) => ({
					value: id,
					title: provider.name,
				}),
			);
		case 'langflower.models': {
			const providerId =
				item.dependsOn !== undefined
					? currentParams[item.dependsOn]
					: undefined;
			const provider =
				typeof providerId === 'string'
					? config.provider?.[providerId]
					: undefined;

			return (provider?.models ?? []).map((model) => ({
				value: model,
				title: model,
			}));
		}
		case 'langflower.tools':
			return (config.tools ?? []).map((tool) => ({
				value: tool.id,
				title: tool.name,
			}));
		case 'langflower.skills':
			return (config.skills ?? []).map((skill) => ({
				value: skill.id,
				title: skill.name,
				description: skill.description,
			}));
		case 'node.wiredTools':
			throw new Error(
				'resolveUiSchemaOptions does not resolve node.wiredTools — use resolveEnabledToolOptions(graph, nodeId).',
			);
		case 'langflower.mcpServers':
			return resolveMcpServerOptions(config);
		case undefined:
			return [];
		default: {
			const _exhaustive: never = source;
			return _exhaustive;
		}
	}
};
