import { defineReactiveNode } from '@langflower/node-sdk';

/** Boolean literal — inline `value` input, no wire required. */
export const booleanNode = defineReactiveNode({
	type: 'common-boolean',
	displayName: 'Boolean',
	category: 'Primitives',
	description: 'Emits a **boolean literal** from the inline `value` field.',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const value$ = makeInput<boolean>('value', {
			name: 'value',
			wireType: 'boolean',
			inline: 'boolean',
			defaultValue: false,
		});

		return {
			inputs: [value$],
			outputs: [
				configureOutput('value', value$, {
					wireType: 'boolean',
				}),
			],
		};
	},
});
