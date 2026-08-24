import { defineReactiveNode } from '@langflower/node-sdk';

/** Number literal — inline `value` input, no wire required. */
export const numberNode = defineReactiveNode({
	type: 'common-number',
	displayName: 'Number',
	category: 'Primitives',
	description: `
Put a constant number on the canvas and wire it onward.

Typical uses:
- A Repeat **count** or Delay milliseconds
- A threshold for Compare or Loop
`.trim(),
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
