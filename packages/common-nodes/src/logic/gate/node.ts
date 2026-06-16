import { defineReactiveNode } from '@langflower/node-sdk';
import { EMPTY, mergeMap, of } from 'rxjs';

/** Forwards `value` only when `pass` is strictly `true`. */
export const gateNode = defineReactiveNode({
	type: 'common-gate',
	displayName: 'Gate',
	category: 'Logic',
	paletteSecondary: true,
	description:
		'Forwards wired `value` only when boolean `pass` is true; otherwise emits nothing.',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const pass = makeInput<boolean>('pass', {
			name: 'pass',
			wireType: 'boolean',
			required: true,
		});
		const value = makeInput<unknown>('value', {
			name: 'value',
			dynamic: true,
			defaultValue: null,
		});

		const output$ = combineInputs([pass, value], ([shouldPass, val]) => ({
			shouldPass: shouldPass === true,
			val,
		})).pipeValue(
			mergeMap(({ shouldPass, val }) => (shouldPass ? of(val) : EMPTY)),
		);

		return {
			inputs: [pass, value],
			outputs: [
				configureOutput('value', output$, {
					inferTypeFrom: value,
				}),
			],
		};
	},
});
