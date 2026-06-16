import type { InlineConfig } from '@langflower/node-sdk';

type NumberUiConstraints = {
	readonly min?: number;
	readonly max?: number;
	readonly step?: number;
};

/**
 * Maps uiSchema number constraints onto the same {@link InlineConfig} shape
 * canvas inline number fields already use (`min` / `max` / `step`).
 */
export const numberInlineConfigFromUiSchema = (
	item: NumberUiConstraints,
): Extract<InlineConfig, { readonly type: 'number' }> => ({
	type: 'number',
	...(typeof item.min === 'number' ? { min: item.min } : {}),
	...(typeof item.max === 'number' ? { max: item.max } : {}),
	...(typeof item.step === 'number' ? { step: item.step } : {}),
});
