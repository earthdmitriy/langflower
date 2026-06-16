import { defineReactiveNode } from '@langflower/node-sdk';
import { concatMap, delay, of } from 'rxjs';

/**
 * Pass-through with configurable RxJS delay on inline `delay` input (ms).
 *
 * Built with `combineInputs(...).pipeValue(concatMap(...))`. The runtime's
 * `tapOutputPort` taps this output and forwards its `pending`/`value` lifecycle
 * over the WS bridge — the bridge now holds an always-on `events$` subscription
 * (see BUG-2026-07-14 in `docs/FOUND_BUGS.md`), so the `pending` pulse is
 * delivered to the UI. `delayMs` is annotated because `combineInputs` passes the
 * combined value as an untyped tuple.
 */
export const delayNode = defineReactiveNode({
	type: 'common-delay',
	displayName: 'Delay',
	category: 'Flow',
	paletteSecondary: true,
	description:
		'Passes through the wired `value` after an inline **delay** in milliseconds.',
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
		).pipeValue(
			concatMap(({ inputValue, delayMs }) =>
				of(inputValue).pipe(delay(delayMs)),
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
