import { defineReactiveNode } from '../../define-reactive-node.js';

/** Passthrough that ends the run on first output emission. */
export const finishSampleNode = defineReactiveNode({
	type: 'sample-finish',
	displayName: 'Finish',
	category: 'Samples',
	stopsRun: true,
	emitOncePerActivation: true,
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const value = makeInput('value', { name: 'value' });

		return {
			inputs: [value],
			outputs: [
				configureOutput('value', value, {
					inferTypeFrom: value,
				}),
			],
		};
	},
});
