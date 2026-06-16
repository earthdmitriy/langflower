import { defineReactiveNode } from '@langflower/node-sdk';
import {
	COMPARE_OP_OPTIONS,
	evaluateCompare,
	parseCompareOp,
} from './evaluate-compare.js';

/** Binary comparison → boolean `result`. */
export const compareNode = defineReactiveNode({
	type: 'common-compare',
	displayName: 'Compare',
	category: 'Logic',
	paletteSecondary: true,
	description:
		'Compares wired `a` and `b` with panel operator (`eq`, `ne`, `lt`, …) → boolean `result`.',
	uiSchema: [
		{
			field: 'op',
			type: 'select',
			label: 'Operator',
			default: 'eq',
			options: COMPARE_OP_OPTIONS,
		},
	] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const a = makeInput<unknown>('a', {
			name: 'a',
			dynamic: true,
			required: true,
		});
		const b = makeInput<unknown>('b', {
			name: 'b',
			dynamic: true,
			required: true,
		});

		const result$ = combineInputs([a, b, ctx], ([left, right, ec]) =>
			evaluateCompare(left, right, parseCompareOp(ec.params.op)),
		);

		return {
			inputs: [a, b],
			outputs: [
				configureOutput('result', result$, {
					wireType: 'boolean',
				}),
			],
		};
	},
});
