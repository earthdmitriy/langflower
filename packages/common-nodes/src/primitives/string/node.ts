import { defineReactiveNode } from '@langflower/node-sdk';

/** String literal — inline `value` input, no wire required. */
export const stringNode = defineReactiveNode({
	type: 'common-string',
	displayName: 'String',
	category: 'Primitives',
	description: 'Emits a **string literal** from the inline `value` field.',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const value$ = makeInput<string>('value', {
			name: 'value',
			wireType: 'string',
			inline: 'text',
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
