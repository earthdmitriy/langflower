import type { PortMeta } from '@langflower/runtime';
import type { StatefulConnection } from '@rx-evo/stateful-observable';
import {
	asapScheduler,
	EMPTY,
	map,
	observeOn,
	of,
	startWith,
	switchMap,
	take,
	toArray,
} from 'rxjs';

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
	readonly normalize: (raw: unknown) => readonly string[];
};

/**
 * External map-collect (C2/C8): pace `item` emissions by `bodyResult`, then
 * emit collected `results` as a JSON string array. Body stays on the canvas —
 * no in-LLM spawn.
 */
export const createMapCollectStreams = (ports: MapCollectPorts) => {
	const item$ = ports.items.pipeValue(
		switchMap((raw) => {
			const list = ports.normalize(raw);

			if (list.length === 0) {
				return EMPTY;
			}

			// Defer the next item so all bodyResult subscribers (including
			// results$) finish the current emission before the body LLM
			// switchMaps a new userPrompt (sync reentrancy with delay 0).
			return ports.bodyResult.value$.pipe(
				startWith(undefined),
				take(list.length),
				observeOn(asapScheduler),
				map((_, index) => list[index] ?? ''),
			);
		}),
	);

	const results$ = ports.items.pipeValue(
		switchMap((raw) => {
			const list = ports.normalize(raw);

			if (list.length === 0) {
				return of('[]');
			}

			return ports.bodyResult.value$.pipe(
				take(list.length),
				map((value) => stringifyLoopValue(value)),
				toArray(),
				map((collected) => JSON.stringify(collected)),
			);
		}),
	);

	return { item$, results$ };
};
