import { defineReactiveNode } from '@langflower/node-sdk';

/** Concat multiple inputs using defined symbol */
export const concatNode = defineReactiveNode({
	type: 'common-concat',
	displayName: 'Concat',
	category: 'Text',
	description: `
Join several strings with a **separator**. Emits only when every wired string has a fresh value.

Type \`\\n\` in the separator for a line break.
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const separator$ = makeInput<string>('separator', {
			name: 'separator',
			required: true,
			inline: 'text',
			wireType: 'string',
			defaultValue: '\\n',
			description: '`\\n` is replaced with a line break.',
		});

		const values$ = makeInput<string[]>('value', {
			name: 'values',
			required: true,
			multi: 'zip',
			wireType: 'string',
		});

		const result$ = combineInputs(
			[separator$, values$],
			([separator, values]) =>
				values.join(separator.replaceAll('\\n', '\n')),
		);

		return {
			inputs: [separator$, values$],
			outputs: [
				configureOutput('value', result$, {
					wireType: 'string',
				}),
			],
		};
	},
});
