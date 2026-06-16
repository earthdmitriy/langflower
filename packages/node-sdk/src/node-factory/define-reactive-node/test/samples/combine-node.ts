import { defineReactiveNode } from '../../define-reactive-node.js';

type CombineSampleResult = {
	readonly a: unknown;
	readonly b: unknown;
	readonly combined: string;
};

/** Two inputs (`a`, `b`) merged → `combined` output. */
export const combineSampleNode = defineReactiveNode({
	type: 'sample-combine',
	displayName: 'Combine',
	category: 'Samples',
	uiSchema: [{ field: 'separator', type: 'string', default: '|' }] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const a = makeInput('a', { name: 'a' });
		const b = makeInput('b', { name: 'b' });
		const fallback = '|';
		const combined$ = combineInputs(
			[a, b, ctx],
			([aVal, bVal, ec]) =>
				({
					a: aVal,
					b: bVal,
					combined: `${String(aVal ?? '')}${String((ec.params as { readonly separator?: unknown } | undefined)?.separator ?? fallback)}${String(bVal ?? '')}`,
				}) satisfies CombineSampleResult,
		);

		return {
			inputs: [a, b],
			outputs: [
				configureOutput('combined', combined$, {
					wireType: 'string',
				}),
			],
		};
	},
});
