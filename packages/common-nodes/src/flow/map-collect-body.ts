import type { PortMeta } from '@langflower/runtime';
import type { StatefulConnection } from '@rx-evo/stateful-observable';
import {
	asapScheduler,
	EMPTY,
	map,
	merge,
	observeOn,
	of,
	shareReplay,
	startWith,
	take,
	toArray,
	Observable,
} from 'rxjs';
import { statefulObservable } from '@rx-evo/stateful-observable';

const stringifyLoopValue = (value: unknown): string => {
	if (typeof value === 'string') {
		return value;
	}

	if (value === undefined) {
		return '';
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

/**
 * Normalize Loop work lists: arrays, JSON arrays, or newline lists.
 */
export const normalizeLoopItems = (raw: unknown): readonly string[] => {
	if (Array.isArray(raw)) {
		return raw.map((entry) => stringifyLoopValue(entry));
	}

	if (typeof raw === 'string') {
		const trimmed = raw.trim();

		if (trimmed.length === 0) {
			return [];
		}

		if (trimmed.startsWith('[')) {
			try {
				const parsed: unknown = JSON.parse(trimmed);

				if (Array.isArray(parsed)) {
					return normalizeLoopItems(parsed);
				}
			} catch {
				// fall through to newline split
			}
		}

		return trimmed
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	if (raw === null || raw === undefined) {
		return [];
	}

	return [stringifyLoopValue(raw)];
};

type MapCollectPorts = {
	readonly items: StatefulConnection<unknown, unknown, PortMeta>;
	readonly bodyResult: StatefulConnection<unknown, unknown, PortMeta>;
	readonly rerunItems: StatefulConnection<unknown, unknown, PortMeta>;
	readonly normalize: (raw: unknown) => readonly string[];
};

type LoopWalk =
	| { readonly kind: 'full'; readonly list: readonly string[] }
	| { readonly kind: 'rerun'; readonly indexes: readonly number[] };

const matchRerunIndexes = (
	list: readonly string[],
	rerun: readonly string[],
): readonly number[] => {
	const wanted = new Set(rerun);
	const indexes: number[] = [];

	for (let index = 0; index < list.length; index += 1) {
		if (wanted.has(list[index] ?? '')) {
			indexes.push(index);
		}
	}

	return indexes;
};

/**
 * `value$` replays the last body result on every subscribe. That value
 * belongs to the previous walk. Drop emissions that happen inside
 * `subscribe` and keep later ones.
 */
const skipSyncReplay = <T>(source: Observable<T>): Observable<T> =>
	new Observable((subscriber) => {
		let open = false;
		const subscription = source.subscribe({
			next: (value) => {
				if (open) {
					subscriber.next(value);
				}
			},
			error: (error: unknown) => {
				subscriber.error(error);
			},
			complete: () => {
				subscriber.complete();
			},
		});
		open = true;

		return () => {
			subscription.unsubscribe();
		};
	});

const paceItems = (
	bodyResult: StatefulConnection<unknown, unknown, PortMeta>,
	list: readonly string[],
): Observable<string> => {
	if (list.length === 0) {
		return EMPTY;
	}

	return skipSyncReplay(bodyResult.value$).pipe(
		startWith(undefined),
		take(list.length),
		observeOn(asapScheduler),
		map((_, index) => list[index] ?? ''),
	);
};

const collectBodyResults = (
	bodyResult: StatefulConnection<unknown, unknown, PortMeta>,
	count: number,
): Observable<readonly string[]> =>
	skipSyncReplay(bodyResult.value$).pipe(
		take(count),
		map((value) => stringifyLoopValue(value)),
		toArray(),
	);

/**
 * External map-collect (C2/C8): pace `item` emissions by `bodyResult`, then
 * emit collected `results` as a JSON string array. Body stays on the canvas —
 * no in-LLM spawn.
 */
export const createMapCollectStreams = (ports: MapCollectPorts) => {
	let lastList: readonly string[] = [];
	let lastResults: readonly string[] = [];
	let completed = false;

	const walks$ = merge(
		ports.items.pipeValue(map((raw) => ({ kind: 'full' as const, raw }))),
		ports.rerunItems.pipeValue(
			map((raw) => ({ kind: 'rerun' as const, raw })),
		),
	).pipe(
		map((event): LoopWalk => {
			if (event.kind === 'full') {
				const list = ports.normalize(event.raw);
				lastList = list;
				lastResults = [];
				completed = false;
				return { kind: 'full', list };
			}

			const indexes = completed
				? matchRerunIndexes(lastList, ports.normalize(event.raw))
				: [];
			return { kind: 'rerun', indexes };
		}),
		shareReplay({ bufferSize: 1, refCount: true }),
	);

	const item$ = statefulObservable({
		input: walks$,
		loader: (walk) => {
			const list =
				walk.kind === 'full'
					? walk.list
					: walk.indexes.map((index) => lastList[index] ?? '');

			// Defer the next item so all bodyResult subscribers (including
			// results$) finish the current emission before the body
			// switchMaps a new prompt (sync reentrancy with delay 0).
			return paceItems(ports.bodyResult, list);
		},
	});

	const results$ = statefulObservable({
		input: walks$,
		loader: (walk) => {
			if (walk.kind === 'full') {
				if (walk.list.length === 0) {
					lastResults = [];
					completed = true;
					return of('[]');
				}

				return collectBodyResults(
					ports.bodyResult,
					walk.list.length,
				).pipe(
					map((collected) => {
						lastResults = collected;
						completed = true;
						return JSON.stringify(collected);
					}),
				);
			}

			if (walk.indexes.length === 0) {
				return EMPTY;
			}

			return collectBodyResults(
				ports.bodyResult,
				walk.indexes.length,
			).pipe(
				map((fresh) => {
					const next = lastResults.slice();
					walk.indexes.forEach((index, slot) => {
						next[index] = fresh[slot] ?? '';
					});
					lastResults = next;
					completed = true;
					return JSON.stringify(next);
				}),
			);
		},
	});

	return { item$, results$ };
};
