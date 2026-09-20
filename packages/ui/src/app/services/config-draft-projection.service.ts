/**
 * Root projection of server-owned Settings draft
 * (`langflower.config.draft.snapshot`). Remount-safe for the settings panel.
 */
import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type {
	LangflowerConfigDraftSnapshotPayload,
	LangflowerConfigScope,
	ProviderConnectionStatus,
} from '@langflower/shared/types/langflower-config';
import {
	configToDraft,
	providerConnectionKey,
	redactDraftSecrets,
	type SettingsDraft,
} from '@langflower/shared/langflower-config/settings-draft';
import { map, shareReplay, startWith } from 'rxjs';
import { LangflowerBridgeService } from './langflower-bridge.service';

const EMPTY_DRAFT = configToDraft({});

const EMPTY_SNAPSHOT: LangflowerConfigDraftSnapshotPayload = {
	scope: 'project',
	draft: EMPTY_DRAFT,
	baseline: EMPTY_DRAFT,
	dirty: false,
	connections: {},
};

@Injectable({ providedIn: 'root' })
export class ConfigDraftProjectionService {
	private readonly bridge = inject(LangflowerBridgeService);

	readonly snapshot$ = this.bridge.cached[
		'langflower.config.draft.snapshot'
	].pipe(
		startWith(EMPTY_SNAPSHOT),
		shareReplay({ bufferSize: 1, refCount: false }),
	);

	readonly snapshot = toSignal(this.snapshot$, {
		initialValue: EMPTY_SNAPSHOT,
	});

	readonly draft = computed(() => this.snapshot().draft);

	readonly baseline = computed(() => this.snapshot().baseline);

	readonly dirty = computed(() => this.snapshot().dirty);

	readonly scope = computed(() => this.snapshot().scope);

	readonly connections = computed(() => this.snapshot().connections);

	readonly connections$ = this.snapshot$.pipe(
		map((snapshot) => snapshot.connections),
		shareReplay({ bufferSize: 1, refCount: false }),
	);

	connectionFor(index: number): ProviderConnectionStatus {
		const row = this.draft().providers[index];
		if (row === undefined) {
			return { state: 'idle' };
		}
		return (
			this.connections()[providerConnectionKey(row)] ?? {
				state: 'idle',
			}
		);
	}

	emitPatch(scope: LangflowerConfigScope, draft: SettingsDraft): void {
		this.bridge.raw['langflower.config.draft.patch.requested'].next({
			scope,
			draft: redactDraftSecrets(draft),
		});
	}

	emitDiscard(scope: LangflowerConfigScope): void {
		this.bridge.raw['langflower.config.draft.discard.requested'].next({
			scope,
		});
	}

	emitSave(scope: LangflowerConfigScope): void {
		this.bridge.raw['langflower.config.save.requested'].next({ scope });
	}
}
