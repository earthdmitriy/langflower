import { concatMap, delay, of } from 'rxjs';
import { defineReactiveNode } from '../../define-reactive-node.js';

/** Pass-through with async delay on `value` input. */
export const delaySampleNode = defineReactiveNode({
	type: 'sample-delay',
	displayName: 'Delay',
	category: 'Samples',
	emitOncePerActivation: true,
	uiSchema: [{ field: 'delayMs', type: 'number', default: 50 }] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const value = makeInput('value', { name: 'value' });
		const output$ = combineInputs([value, ctx], ([inputValue, ec]) => {
			const delayMs = Math.max(0, Number(ec.params?.delayMs ?? 50));
			return { inputValue, delayMs };
		}).pipeValue(
			concatMap(({ inputValue, delayMs }) =>
				of(inputValue).pipe(delay(delayMs)),
			),
		);

		return {
			inputs: [value],
			outputs: [
				configureOutput('value', output$, {
					wireType: 'any',
				}),
			],
		};
	},
});
