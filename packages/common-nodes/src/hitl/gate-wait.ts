import type { NodeStateHook, NodeStateJson } from '@langflower/node-sdk';
import { defer, EMPTY, of, Subject, type Observable } from 'rxjs';

/**
 * Node state for a HITL gate that waits on a person (Review Gate, Chat Loop).
 *
 * It saves `{ result }` while it waits on that value and `{ result: null }`
 * once answered, through the ordinary state hook. After a restart `restore`
 * keeps the value, and merging {@link restored$} into the `result` input
 * re-opens the wait inside the node: no frame is emitted for it, so the work
 * log shows nothing twice. A stale wait is harmless in a new run, because a
 * fresh `result` replaces it and nothing can reply to it without a frame.
 */
export const createGateWait = (): {
	readonly state: NodeStateHook;
	/** The restored `result`, once, or nothing. Merge it into the `result` input. */
	readonly restored$: Observable<string>;
	readonly markWaiting: (value: string) => void;
	readonly markAnswered: () => void;
} => {
	const persisted$ = new Subject<NodeStateJson>();
	let restored: string | undefined;

	return {
		state: {
			persist$: persisted$,
			restore: (incoming) => {
				const saved =
					typeof incoming === 'object' &&
					incoming !== null &&
					!Array.isArray(incoming)
						? (
								incoming as {
									readonly [key: string]: NodeStateJson;
								}
							)['result']
						: undefined;
				restored = typeof saved === 'string' ? saved : undefined;
				return { ok: true };
			},
		},
		restored$: defer(() => (restored === undefined ? EMPTY : of(restored))),
		markWaiting: (value) => {
			persisted$.next({ result: value });
		},
		markAnswered: () => {
			persisted$.next({ result: null });
		},
	};
};
