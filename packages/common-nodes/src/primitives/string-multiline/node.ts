import { defineReactiveNode } from '@langflower/node-sdk';

/** Multiline string literal — inline `value` textarea, no wire required. */
export const stringMultilineNode = defineReactiveNode({
	type: 'common-string-multiline',
	displayName: 'String (multiline)',
	category: 'Primitives',
	description:
		'Emits a **multiline string literal** from the inline `value` textarea.',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const value$ = makeInput<string>('value', {
			name: 'value',
			wireType: 'string',
			inline: 'text-multiline',
			defaultValue: '',
		});

		return {
			inputs: [value$],
			outputs: [
				configureOutput('value', value$, {
					wireType: 'string',
				}),
			],
		};
	},
});
