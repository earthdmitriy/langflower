import type { Observable } from 'rxjs';

/**
 * JSON value a node may persist across runs.
 *
 * Owned by `@langflower/node-sdk`. `@langflower/runtime` keeps a structural
 * twin (ADR-027) and does not import this module.
 */
export type NodeStateJson =
	| null
	| boolean
	| number
	| string
	| readonly NodeStateJson[]
	| { readonly [key: string]: NodeStateJson };

/**
 * Fact stream plus restore for one node's JSON state.
 * Lives on the bind result / instance, not on `ExecutionContext`.
 */
export type NodeStateHook = {
	/** Full JSON-safe state after each committed unit of work. */
	readonly persist$: Observable<NodeStateJson>;
	/**
	 * Called by the runner before wiring. `null` starts fresh.
	 * `{ ok: false }` does not throw and does not abort the run.
	 */
	readonly restore: (
		state: NodeStateJson | null,
	) =>
		| { readonly ok: true }
		| { readonly ok: false; readonly message: string };
};
