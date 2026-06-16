import { defineReactiveNode } from '@langflower/node-sdk';
import { mergeMap, of, throwError } from 'rxjs';

/**
 * Hard harness gate: fails the node when `condition` is not strictly `true`.
 * On success, passthrough of optional `value`.
 */
export const assertNode = defineReactiveNode({
	type: 'common-assert',
	displayName: 'Assert',
	category: 'Logic',
	paletteSecondary: true,
	description:
		'Fails the run branch when `condition` is not true; otherwise passthrough `value`.',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const condition = makeInput<boolean>('condition', {
			name: 'condition',
			wireType: 'boolean',
			required: true,
		});
		const message = makeInput<string>('message', {
			name: 'message',
			wireType: 'string',
			inline: 'text',
			defaultValue: 'Assertion failed',
		});
		const value = makeInput<unknown>('value', {
			name: 'value',
			dynamic: true,
			defaultValue: null,
		});

		const output$ = combineInputs(
			[condition, message, value],
			([cond, msg, val]) => ({
				cond,
				msg: String(msg ?? 'Assertion failed'),
				val,
			}),
		).pipeValue(
			mergeMap(({ cond, msg, val }) => {
				if (cond === true) {
					return of(val);
				}
				return throwError(() => new Error(msg));
			}),
		);

		return {
			inputs: [condition, message, value],
			outputs: [
				configureOutput('value', output$, {
					inferTypeFrom: value,
				}),
			],
		};
	},
});
