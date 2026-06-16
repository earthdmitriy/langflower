import { defineReactiveNode } from '@langflower/node-sdk';

/** Number literal — inline `value` input, no wire required. */
export const numberNode = defineReactiveNode({
	type: 'common-number',
	displayName: 'Number',
	category: 'Primitives',
	description: 'Emits a **number literal** from the inline `value` field.',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const value$ = makeInput<number>('value', {
			name: 'value',
			wireType: 'number',
			inline: { type: 'number' },
			defaultValue: 0,
		});

		return {
			inputs: [value$],
			outputs: [
				configureOutput('value', value$, {
					wireType: 'number',
				}),
			],
		};
	},
});
