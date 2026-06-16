import type { InlineSelectOption } from '@langflower/node-sdk';
import type { UISchemaConstItem } from '@langflower/node-sdk/create-typed-ui-schema';

/**
 * Empty choice for single selects where `""` is a real stored value.
 * Not used for multiselect (e.g. sub-agent `skillIds`).
 *
 * For providers/models, `emptyTitle` overrides `Select…` when a default chat
 * model is configured (e.g. `Default (lmstudio/local-model)`).
 */
export const withSelectEmptyOption = (
	item: Pick<UISchemaConstItem, 'optionsSource'>,
	options: readonly InlineSelectOption[],
	emptyTitle?: string | null,
): readonly InlineSelectOption[] => {
	if (options.some((option) => option.value === '')) {
		return options;
	}

	if (item.optionsSource === 'langflower.skills') {
		return [{ value: '', title: 'None' }, ...options];
	}

	if (
		item.optionsSource === 'langflower.providers' ||
		item.optionsSource === 'langflower.models'
	) {
		const title =
			typeof emptyTitle === 'string' && emptyTitle.trim().length > 0
				? emptyTitle
				: 'Select…';
		return [{ value: '', title }, ...options];
	}

	return options;
};
