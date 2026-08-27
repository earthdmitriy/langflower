import { concatMap, delay, of } from 'rxjs';
import { defineReactiveNode, withLoading } from '@langflower/node-sdk';

/**
 * Pass-through with configurable RxJS delay on inline `delay` input (ms).
 *
 * Stamp pending with {@link withLoading} on the raw stream before async
 * `pipeValue`. `pipeValue(concatMap(delay))` only delays success.
 */
export const delayNode = defineReactiveNode({
	type: 'common-delay',
	displayName: 'Delay',
	category: 'Flow',
	paletteSecondary: true,
	description: `
Hold a value for a number of milliseconds, then pass it on unchanged.

Typical uses:
- Pace a Repeat or Split (paced) loop
- Wait before the next API or file step
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const value = makeInput<unknown>('value', {
			name: 'value',
			dynamic: true,
			required: true,
		});
		const delayInput = makeInput<number>('delay', {
			name: 'delay',
			wireType: 'number',
			inline: 'text',
			defaultValue: 0,
		});

		const output$ = combineInputs(
			[value, delayInput],
			([inputValue, delayMs]) => ({ inputValue, delayMs }),
		)
			.pipe(withLoading())
			.pipeValue(
				concatMap(({ inputValue, delayMs }) =>
					of(inputValue).pipe(
						delay(Math.max(0, Number(delayMs) || 0)),
					),
				),
			);

		return {
			inputs: [value, delayInput],
			outputs: [
				configureOutput('value', output$, {
					inferTypeFrom: value,
				}),
			],
		};
	},
});
