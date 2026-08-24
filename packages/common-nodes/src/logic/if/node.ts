import { defineReactiveNode } from '@langflower/node-sdk';
import { EMPTY, mergeMap, of } from 'rxjs';

/** Routes `value` to `true` or `false` output from boolean `condition`. */
export const ifNode = defineReactiveNode({
	type: 'common-if',
	displayName: 'IF',
	category: 'Logic',
	paletteSecondary: true,
	description: `
Send **value** out **true** or **false** depending on **condition**.

Typical uses:
- Branch after Compare or Assert
- Two different follow-up paths from one check
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const condition = makeInput<boolean>('condition', {
			name: 'condition',
			wireType: 'boolean',
			required: true,
		});
		const value = makeInput<unknown>('value', {
			name: 'value',
			dynamic: true,
			defaultValue: null,
		});

		const decision$ = combineInputs([condition, value], ([cond, val]) => ({
			pass: cond === true,
			val,
		}));

		const true$ = decision$.pipeValue(
			mergeMap(({ pass, val }) => (pass ? of(val) : EMPTY)),
		);
		const false$ = decision$.pipeValue(
			mergeMap(({ pass, val }) => (pass ? EMPTY : of(val))),
		);

		return {
			inputs: [condition, value],
			outputs: [
				configureOutput('true', true$, {
					inferTypeFrom: value,
				}),
				configureOutput('false', false$, {
					inferTypeFrom: value,
				}),
			],
		};
	},
});
