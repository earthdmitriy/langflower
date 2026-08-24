import { defineReactiveNode } from '@langflower/node-sdk';

/** Boolean literal — inline `value` input, no wire required. */
export const booleanNode = defineReactiveNode({
	type: 'common-boolean',
	displayName: 'Boolean',
	category: 'Primitives',
	description: `
Put a constant true/false on the canvas.

Typical uses:
- Drive IF, Gate, or Assert without another node
- A toggle you can flip while authoring
`.trim(),
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
