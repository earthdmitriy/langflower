import type { StatefulObservable } from '@rx-evo/stateful-observable';

/**
 * Author-SDK port / wire contracts.
 *
 * Intentionally owned here (not imported from `@langflower/runtime`) so custom
 * node packs peer only on `@langflower/node-sdk` (+ rxjs /
 * stateful-observable). See [ADR-027](../../../../docs/ADR.md#adr-027--author-sdk-owns-port-types-no-production-runtime-dep).
 * Structural parity with runtime is locked by `runtime-parity.types.test.ts`.
 */

/** Same brand as runtime `RuntimeWireType` so bypass maps stay assignable. */
export type WireType = string & { __brand: 'RuntimeWireType' };

export type InputPortMode = 'single' | 'merge' | 'combine' | 'zip' | 'bypass';

export type FeedRole =
	'none' | 'reasoning' | 'draft' | 'tool' | 'shell' | 'result' | 'recovery';

/**
 * Feed projection metadata shared by input and output port contracts.
 *
 * `streaming: true` keeps the visit open (chunks / interleaved streams).
 * Omit it so the frame closes the visit; same-node frames while last still
 * append to that visit.
 */
export type FeedPortMeta = {
	readonly role?: FeedRole;
	readonly streaming?: boolean;
};

/**
 * Typed metadata on every `statefulConnection` / `statefulObservable` `meta`.
 * Must stay structurally identical to runtime `PortMeta`.
 */
export type PortMeta = {
	readonly dir: 'in' | 'out';
	readonly portId: string | symbol;
	readonly wireType: string | symbol;
	readonly mode?: InputPortMode;
	readonly fromInput?: string;
	readonly defaultValue?: unknown;
	readonly feed?: FeedPortMeta;
};

/** Extract the `meta` type carried by a {@link StatefulObservable}. */
export type MetaFromStatefulObservable<
	T extends StatefulObservable<unknown, unknown, unknown>,
> = T extends StatefulObservable<unknown, unknown, infer Meta> ? Meta : never;
