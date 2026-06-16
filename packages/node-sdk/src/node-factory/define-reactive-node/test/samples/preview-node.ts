import { defineReactiveNode } from '../../define-reactive-node.js';

/** Preview stand-in — `text` in → formatted `text` out. */
export const previewSampleNode = defineReactiveNode({
	type: 'sample-preview',
	displayName: 'Preview',
	category: 'Samples',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const text = makeInput<string>('text', { name: 'text' });

		return {
			inputs: [text],
			outputs: [
				configureOutput('text', text, {
					inferTypeFrom: text,
				}),
			],
		};
	},
});
