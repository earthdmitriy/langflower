import { defineReactiveNode } from '@langflower/node-sdk';

/** Merge multiple inputs into one */
export const mergeNode = defineReactiveNode({
	type: 'common-merge',
	displayName: 'Merge',
	category: 'Flow',
	paletteSecondary: true,
	description:
		'Merges multiple `value` inputs into a **single stream** as values arrive.',
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
