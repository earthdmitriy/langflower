import { defineReactiveNode } from '@langflower/node-sdk';
import {
	asapScheduler,
	filter,
	map,
	observeOn,
	of,
	startWith,
	switchMap,
	take,
} from 'rxjs';

/**
 * Repeats wired `value` `count` times: first ASAP, later on `trigger`.
 * After the last value, the next pace slot emits `done: true` (no value).
 */
export const repeatNode = defineReactiveNode({
	type: 'common-repeat',
	displayName: 'Repeat',
	category: 'Flow',
	paletteSecondary: true,
	description:
		'Repeats wired `value` **count** times. First emit ASAP; later emits wait for `trigger`. After the last value, the next trigger emits `done: true` instead of another value.',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const value = makeInput<unknown>('value', {
			name: 'value',
			dynamic: true,
			required: true,
		});
		const count = makeInput<number>('count', {
			name: 'count',
			wireType: 'number',
			inline: { type: 'number', min: 1, step: 1 },
			defaultValue: 1,
		});
		const trigger = makeInput<unknown>('trigger', {
			name: 'trigger',
			dynamic: true,
			required: true,
		});

		const session$ = combineInputs([value, count], ([v, rawCount]) => ({
			v,
			n: Math.max(0, Math.floor(Number(rawCount) || 0)),
		})).pipeValue(
			switchMap(({ v, n }) => {
				if (n <= 0) {
					return of({ kind: 'done' as const });
				}
				return trigger.value$.pipe(
					startWith(undefined),
					take(n + 1),
					observeOn(asapScheduler),
					map((_, index) =>
						index < n
							? { kind: 'value' as const, value: v, index }
							: { kind: 'done' as const },
					),
				);
			}),
		);

		const valueOut$ = session$.pipeValue(
			filter((e) => e.kind === 'value'),
			map((e) => e.value),
		);

		const indexOut$ = session$.pipeValue(
			filter((e) => e.kind === 'value'),
			map((e) => e.index),
		);

		const doneOut$ = session$.pipeValue(
			filter((e) => e.kind === 'done'),
			map(() => true),
		);

		return {
			inputs: [value, count, trigger],
			outputs: [
				configureOutput('value', valueOut$, {
					inferTypeFrom: value,
				}),
				configureOutput('index', indexOut$, {
					wireType: 'number',
				}),
				configureOutput('done', doneOut$, {
					wireType: 'boolean',
					feed: { role: 'none' },
				}),
			],
		};
	},
});
