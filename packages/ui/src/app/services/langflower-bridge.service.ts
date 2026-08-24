/**
 * Typed WebSocket client for Langflower — sole transport entry point.
 * Exposes `langflowerWsConfig` subjects/observables; no RPC wrappers.
 *
 * Pure last-value S→C snapshots listed in {@link CACHED_BRIDGE_EVENTS} are
 * eagerly subscribed with `shareReplay(1)` so bootstrap facts survive late
 * feature mounts. Live runner deltas stay on {@link raw} only.
 */
import { DestroyRef, Injectable, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { createClient } from '@langflower/websocket-bridge/create-client';
import type { WsBridgeClientApi } from '@langflower/websocket-bridge';
import { langflowerWsConfig } from '@langflower/shared/langflower';
import { type Observable, shareReplay } from 'rxjs';

export type LangflowerBridgeClient = WsBridgeClientApi<
	typeof langflowerWsConfig
>;

/**
 * Pure last-snapshot S→C facts that bootstrap can emit before late readers
 * mount. Never add live runner deltas or multi-ask streams here.
 */
const CACHED_BRIDGE_EVENTS = [
	'langflower.models.catalog.snapshot',
	'langflower.config.snapshot',
	'langflower.config.draft.snapshot',
	'session.state.snapshot',
	'palette.snapshot',
	'customPalette.snapshot',
	'workflow.current.snapshot',
	'workflow.list.snapshot',
	'workflow.currentStatus.snapshot',
	'executionFeed.snapshot',
	'toolConfig.snapshot',
	'editor.dividers.snapshot',
	'editor.paletteVisible.snapshot',
	'runner.checkpoints.snapshot',
] as const satisfies ReadonlyArray<keyof LangflowerBridgeClient>;

/** Keys from {@link CACHED_BRIDGE_EVENTS}. */
type CachedBridgeEventKey = (typeof CACHED_BRIDGE_EVENTS)[number];

type BridgePayload<K extends CachedBridgeEventKey> =
	LangflowerBridgeClient[K] extends Observable<infer P> ? P : never;

/**
 * Map of cached S→C streams: same Observable payload types as
 * {@link LangflowerBridgeClient} for each listed key.
 */
export type CachedBridgeEvents = {
	readonly [K in CachedBridgeEventKey]: Observable<BridgePayload<K>>;
};

const cacheBridgeEvent = <K extends CachedBridgeEventKey>(
	raw: LangflowerBridgeClient,
	key: K,
	destroyRef: DestroyRef,
): Observable<BridgePayload<K>> => {
	const cached$ = (raw[key] as Observable<BridgePayload<K>>).pipe(
		takeUntilDestroyed(destroyRef),
		shareReplay(1),
	);
	cached$.subscribe();
	return cached$;
};

@Injectable({ providedIn: 'root' })
export class LangflowerBridgeService implements OnDestroy {
	private readonly destroyRef = inject(DestroyRef);

	readonly raw: LangflowerBridgeClient;

	/**
	 * Eager shareReplay(1) views of {@link CACHED_BRIDGE_EVENTS}.
	 * Prefer these over {@link raw} for the listed snapshot keys.
	 */
	readonly cached: CachedBridgeEvents;

	constructor() {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${protocol}//${window.location.host}/ws`;

		this.raw = createClient(langflowerWsConfig, { url });

		this.cached = Object.fromEntries(
			CACHED_BRIDGE_EVENTS.map((key) => [
				key,
				cacheBridgeEvent(this.raw, key, this.destroyRef),
			]),
		) as CachedBridgeEvents;
	}

	ngOnDestroy(): void {
		this.raw.close();
	}
}
