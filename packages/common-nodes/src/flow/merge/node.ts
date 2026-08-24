import { defineReactiveNode } from '@langflower/node-sdk';

/** Merge multiple inputs into one */
export const mergeNode = defineReactiveNode({
	type: 'common-merge',
	displayName: 'Merge',
	category: 'Flow',
	paletteSecondary: true,
	description: `
Join several wires into one. Each incoming value is forwarded as it arrives.

Typical uses:
- Fan-in parallel branches
- Collect results from Router channels
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const value$ = makeInput('value', {
			name: 'value',
			required: true,
			multi: 'merge',
		});

		return {
			inputs: [value$],
			outputs: [
				configureOutput('value', value$, {
					inferTypeFrom: value$,
				}),
			],
		};
	},
});
