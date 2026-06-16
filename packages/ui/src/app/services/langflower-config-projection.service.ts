/**
 * Root projection of project `LangflowerConfig` from bridge snapshots.
 *
 * Inspector mounts only when a node is selected, so it would miss one-shot
 * bootstrap `session.state.snapshot` / `langflower.config.snapshot` events.
 * This service is constructed with the always-mounted editor shell and keeps
 * the latest config via `shareReplay` for late readers.
 *
 * Every `langflower.config.snapshot` (connect + post-Save) replaces effective
 * config and Settings layers — not connect-only cache.
 */
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type {
	LangflowerConfig,
	LangflowerConfigSnapshotPayload,
} from '@langflower/shared/langflower';
import { map, merge, scan, shareReplay, startWith } from 'rxjs';
import { LangflowerBridgeService } from './langflower-bridge.service';

export type LangflowerConfigLayersProjection = {
	readonly config: LangflowerConfig;
	readonly projectConfig: LangflowerConfig;
	readonly globalConfig: LangflowerConfig;
	readonly globalPath: string;
};

const EMPTY_LAYERS: LangflowerConfigLayersProjection = {
	config: {},
	projectConfig: {},
	globalConfig: {},
	globalPath: '',
};

type ConfigProjectionEvent =
	| {
			readonly kind: 'session';
			readonly config: LangflowerConfig;
	  }
	| {
			readonly kind: 'snapshot';
			readonly payload: LangflowerConfigSnapshotPayload;
	  };

@Injectable({ providedIn: 'root' })
export class LangflowerConfigProjectionService {
	private readonly bridge = inject(LangflowerBridgeService);

	readonly layers$ = merge(
		this.bridge.cached['session.state.snapshot'].pipe(
			map((snapshot): ConfigProjectionEvent => ({
				kind: 'session',
				config: snapshot.langflowerConfig,
			})),
		),
		this.bridge.cached['langflower.config.snapshot'].pipe(
			map((payload): ConfigProjectionEvent => ({
				kind: 'snapshot',
				payload,
			})),
		),
	).pipe(
		scan((previous, event): LangflowerConfigLayersProjection => {
			if (event.kind === 'session') {
				return {
					...previous,
					config: event.config,
				};
			}

			return {
				config: event.payload.config,
				projectConfig: event.payload.projectConfig,
				globalConfig: event.payload.globalConfig,
				globalPath: event.payload.globalPath,
			};
		}, EMPTY_LAYERS),
		startWith(EMPTY_LAYERS),
		shareReplay({ bufferSize: 1, refCount: false }),
	);

	readonly config$ = this.layers$.pipe(map((layers) => layers.config));

	/** Synchronous read for Inspector `computed` / panel rows. */
	readonly config = toSignal(this.config$, {
		initialValue: EMPTY_LAYERS.config,
	});

	readonly layers = toSignal(this.layers$, { initialValue: EMPTY_LAYERS });
}
