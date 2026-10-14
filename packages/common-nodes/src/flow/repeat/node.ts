import {
	type NodeStateHook,
	type NodeStateJson,
	defineReactiveNode,
} from '@langflower/node-sdk';
import {
	EMPTY,
	asapScheduler,
	filter,
	map,
	observeOn,
	of,
	startWith,
	Subject,
	switchMap,
	take,
	tap,
} from 'rxjs';

type RepeatCursor = {
	readonly nextIndex: number;
	readonly done: boolean;
	readonly count: number;
};

const freshCursor = (count = 0): RepeatCursor => ({
	nextIndex: 0,
	done: false,
	count,
});

const isCursorRecord = (
	state: NodeStateJson,
): state is { readonly [key: string]: NodeStateJson } =>
	typeof state === 'object' && state !== null && !Array.isArray(state);

const parseCursor = (state: NodeStateJson): RepeatCursor | undefined => {
	if (!isCursorRecord(state)) {
		return undefined;
	}

	const nextIndex = state['nextIndex'];
	const done = state['done'];
	const count = state['count'];

	if (
		typeof nextIndex !== 'number' ||
		!Number.isInteger(nextIndex) ||
		nextIndex < 0 ||
		typeof done !== 'boolean' ||
		typeof count !== 'number' ||
		!Number.isInteger(count) ||
		count < 0 ||
		nextIndex > count ||
		(done && nextIndex !== count)
	) {
		return undefined;
	}

	return { nextIndex, done, count };
};

const cursorJson = (cursor: RepeatCursor): NodeStateJson => ({
	nextIndex: cursor.nextIndex,
	done: cursor.done,
	count: cursor.count,
});

/**
 * Repeats wired `value` `count` times: first ASAP, later on `trigger`.
 * After the last value, the next pace slot emits `done: true` (no value).
 *
 * The cursor (`nextIndex`, `done`, `count`) is a state hook so the next
 * Run continues the remaining slots instead of starting at 0.
 */
export const repeatNode = defineReactiveNode({
	type: 'common-repeat',
	displayName: 'Repeat',
	category: 'Flow',
	paletteSecondary: true,
	description: `
Send the same value several times. The first copy starts immediately; pulse **trigger** for the next.

After the last copy, the next trigger fires **done** instead of another value. **index** counts from 0 so you can show progress.
`.trim(),
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

		const persisted$ = new Subject<NodeStateJson>();
		let cursor = freshCursor();
		let useRestored = false;

		const publish = (): void => {
			persisted$.next(cursorJson(cursor));
		};

		const restore: NodeStateHook['restore'] = (state) => {
			if (state === null) {
				cursor = freshCursor();
				useRestored = false;
				return { ok: true };
			}

			const parsed = parseCursor(state);

			if (parsed === undefined) {
				cursor = freshCursor();
				useRestored = false;
				return { ok: false, message: 'Repeat cursor is invalid' };
			}

			cursor = parsed;
			useRestored = true;
			return { ok: true };
		};

		const session$ = combineInputs([value, count], ([v, rawCount]) => ({
			v,
			n: Math.max(0, Math.floor(Number(rawCount) || 0)),
		})).pipeValue(
			switchMap(({ v, n }) => {
				if (useRestored) {
					useRestored = false;
					if (cursor.count !== n) {
						cursor = freshCursor(n);
						publish();
					}
				} else if (cursor.nextIndex !== 0 || cursor.done) {
					cursor = freshCursor(n);
					publish();
				} else {
					cursor = freshCursor(n);
				}

				if (cursor.done) {
					return EMPTY;
				}

				if (n <= 0 || cursor.nextIndex >= n) {
					return of({ kind: 'done' } as const).pipe(
						tap(() => {
							cursor = {
								nextIndex: n,
								done: true,
								count: n,
							};
							publish();
						}),
					);
				}

				const start = cursor.nextIndex;
				const remaining = n - start;

				return trigger.value$.pipe(
					startWith(undefined),
					take(remaining + 1),
					observeOn(asapScheduler),
					map((_, slot) => {
						if (slot < remaining) {
							const index = start + slot;
							cursor = {
								nextIndex: index + 1,
								done: false,
								count: n,
							};
							publish();
							return {
								kind: 'value' as const,
								value: v,
								index,
							};
						}

						cursor = { nextIndex: n, done: true, count: n };
						publish();
						return { kind: 'done' as const };
					}),
				);
			}),
		);

		const valueOut$ = session$.pipeValue(
			filter((event) => event.kind === 'value'),
			map((event) => event.value),
		);

		const indexOut$ = session$.pipeValue(
			filter((event) => event.kind === 'value'),
			map((event) => event.index),
		);

		const doneOut$ = session$.pipeValue(
			filter((event) => event.kind === 'done'),
			map(() => true),
		);

		const state: NodeStateHook = {
			persist$: persisted$.asObservable(),
			restore,
		};

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
			state,
		};
	},
});
