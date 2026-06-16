import { defineReactiveNode } from '../../define-reactive-node.js';

/** Multi `lines` input array → joined `text` output. */
export const joinSampleNode = defineReactiveNode({
	type: 'sample-join',
	displayName: 'Join',
	category: 'Samples',
	uiSchema: [{ field: 'separator', type: 'string', default: '\n' }] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const lines = makeInput<readonly unknown[]>('lines', {
			name: 'lines',
			wireType: 'string',
			multi: 'combine',
			required: true,
		});
		const fallback = '\n';
		const text$ = combineInputs([lines, ctx], ([values, ec]) => {
			const separator = (
				ec.params as { readonly separator?: unknown } | undefined
			)?.separator;

			return (values as readonly unknown[])
				.map((value) => String(value ?? ''))
				.join(String(separator ?? fallback));
		});

		return {
			inputs: [lines],
			outputs: [
				configureOutput('text', text$, {
					wireType: 'string',
				}),
			],
		};
	},
});
