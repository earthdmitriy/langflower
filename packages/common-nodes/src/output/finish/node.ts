import { defineReactiveNode } from '@langflower/node-sdk';

/** Passthrough sink — first output emission stops the run. */
export const finishNode = defineReactiveNode({
	type: 'common-finish',
	displayName: 'Finish',
	category: 'Output',
	description:
		'Passthrough sink — the first output emission **stops the run**.',
	stopsRun: true,
	emitOncePerActivation: true,
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const value = makeInput('value', { name: 'value', required: true });

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
