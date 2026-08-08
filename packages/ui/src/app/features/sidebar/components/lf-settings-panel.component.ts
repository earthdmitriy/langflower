/**
 * Settings aside — project / global langflower.jsonc editors (v1 providers).
 */
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	OnDestroy,
	signal,
	untracked,
} from '@angular/core';
import {
	configToDraft,
	defaultProviderStaticModelIds,
	draftToSavePayload,
	mergeProviderModelOptions,
	type LangflowerConfigScope,
	type LangflowerProviderModelsCatalog,
	type ProviderConnectionStatus,
	type ProviderModelEntry,
} from '@langflower/shared/langflower';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, take } from 'rxjs';
import { ConfigDraftProjectionService } from '../../../services/config-draft-projection.service';
import { EditorSettingsProjectionService } from '../../../services/editor-settings-projection.service';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { LangflowerConfigProjectionService } from '../../../services/langflower-config-projection.service';
import { ModelsCatalogProjectionService } from '../../../services/models-catalog-projection.service';
import type {
	ProviderDraft,
	ServerLogsDraft,
	SettingsDraft,
} from '../utils/settings-draft';
import {
	draftAfterLayerSnapshot,
	mergeDraftPatch,
	sameDraft,
} from '../utils/settings-draft';

const DRAFT_PATCH_DEBOUNCE_MS = 250;

@Component({
	selector: 'lf-settings-panel',
	standalone: true,
	template: `
		<div class="flex h-full min-h-0 flex-col gap-3">
			<div class="flex shrink-0 items-center justify-between gap-2">
				<h2
					class="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
				>
					Settings
				</h2>
				<button
					type="button"
					class="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
					aria-label="Close settings"
					(click)="onClose()"
				>
					Close
				</button>
			</div>

			<div
				class="flex shrink-0 gap-1 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700"
				role="tablist"
				aria-label="Settings scope"
			>
				<button
					type="button"
					role="tab"
					class="flex-1 rounded px-2 py-1 text-[11px] font-medium transition"
					[class.bg-zinc-900]="scope() === 'project'"
					[class.text-white]="scope() === 'project'"
					[class.text-zinc-600]="scope() !== 'project'"
					[class.dark:bg-zinc-100]="scope() === 'project'"
					[class.dark:text-zinc-900]="scope() === 'project'"
					[attr.aria-selected]="scope() === 'project'"
					(click)="setScope('project')"
				>
					Project
				</button>
				<button
					type="button"
					role="tab"
					class="flex-1 rounded px-2 py-1 text-[11px] font-medium transition"
					[class.bg-zinc-900]="scope() === 'global'"
					[class.text-white]="scope() === 'global'"
					[class.text-zinc-600]="scope() !== 'global'"
					[class.dark:bg-zinc-100]="scope() === 'global'"
					[class.dark:text-zinc-900]="scope() === 'global'"
					[attr.aria-selected]="scope() === 'global'"
					(click)="setScope('global')"
				>
					Global
				</button>
			</div>

			@if (scope() === 'global') {
				<p
					class="shrink-0 break-all text-[11px] leading-4 text-zinc-500 dark:text-zinc-400"
				>
					Global file:
					<span class="font-mono text-zinc-700 dark:text-zinc-300">{{
						globalPath() || '…'
					}}</span>
				</p>
			}

			@if (validationError(); as error) {
				<p
					class="shrink-0 text-[11px] leading-4 text-rose-600 dark:text-rose-400"
				>
					{{ error }}
				</p>
			}

			<div class="lf-scroll min-h-0 flex-1 overflow-y-auto">
				<div class="flex flex-col gap-4 pr-1">
					<div class="flex flex-col gap-2">
						<span
							class="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
						>
							Default chat model
						</span>
						<label class="flex flex-col gap-1">
							<span
								class="text-[10px] text-zinc-500 dark:text-zinc-400"
								>Default provider</span
							>
							<select
								class="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none ring-zinc-400/20 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
								(change)="
									onDefaultProviderChange(readSelect($event))
								"
							>
								<option
									value=""
									[selected]="
										draft().defaultProviderId.trim()
											.length === 0
									"
								>
									None
								</option>
								@for (
									row of defaultProviderOptions();
									track row.id
								) {
									<option
										[value]="row.id"
										[selected]="
											draft().defaultProviderId === row.id
										"
									>
										{{ row.title }}
									</option>
								}
							</select>
						</label>
						<label class="flex flex-col gap-1">
							<span
								class="text-[10px] text-zinc-500 dark:text-zinc-400"
								>Default model</span
							>
							<select
								class="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none ring-zinc-400/20 focus:ring-2 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
								[disabled]="
									draft().defaultProviderId.trim().length ===
									0
								"
								(change)="
									patchDraft({
										defaultModelId: readSelect($event),
									})
								"
							>
								<option
									value=""
									[selected]="
										draft().defaultModelId.trim().length ===
										0
									"
								>
									None
								</option>
								@for (
									option of defaultModelSelectOptions();
									track option.value
								) {
									<option
										[value]="option.value"
										[selected]="
											draft().defaultModelId ===
											option.value
										"
									>
										{{ option.title }}
									</option>
								}
							</select>
						</label>
					</div>

					<fieldset class="flex flex-col gap-1.5">
						<legend
							class="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
						>
							Server logs
						</legend>
						<p
							class="text-[11px] leading-4 text-zinc-500 dark:text-zinc-400"
						>
							Bridge diagnostics under
							<span class="font-mono">.langflower/logs/</span>.
							Default leaves this scope unset (inherits the other
							scope; product default is on).
						</p>
						<div
							class="flex flex-wrap gap-3"
							role="radiogroup"
							aria-label="Server logs"
						>
							@for (
								option of serverLogsOptions;
								track option.value
							) {
								<label
									class="inline-flex items-center gap-1.5 text-[11px] text-zinc-700 dark:text-zinc-300"
								>
									<input
										type="radio"
										name="server-logs"
										class="align-middle"
										[checked]="
											draft().serverLogs === option.value
										"
										(change)="
											patchDraft({
												serverLogs: option.value,
											})
										"
									/>
									{{ option.label }}
								</label>
							}
						</div>
					</fieldset>

					<div class="flex flex-col gap-2">
						<div class="flex items-center justify-between gap-2">
							<span
								class="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
							>
								Providers
							</span>
							<button
								type="button"
								class="rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
								(click)="addProvider()"
							>
								Add
							</button>
						</div>

						@for (
							row of draft().providers;
							track $index;
							let index = $index
						) {
							<div
								class="flex flex-col gap-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-700"
							>
								<div
									class="flex items-start justify-between gap-2"
								>
									<span
										class="text-[11px] font-medium text-zinc-700 dark:text-zinc-300"
									>
										Provider {{ index + 1 }}
									</span>
									<button
										type="button"
										class="text-[11px] text-rose-600 hover:underline dark:text-rose-400"
										(click)="removeProvider(index)"
									>
										Remove
									</button>
								</div>
								<label class="flex flex-col gap-1">
									<span
										class="text-[10px] text-zinc-500 dark:text-zinc-400"
										>Id</span
									>
									<input
										type="text"
										class="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
										[value]="row.id"
										(input)="
											patchProviderDebounced(index, {
												id: readInput($event),
											})
										"
										(blur)="
											patchProviderFlush(index, {
												id: readInput($event),
											})
										"
									/>
								</label>
								<label class="flex flex-col gap-1">
									<span
										class="text-[10px] text-zinc-500 dark:text-zinc-400"
										>Name</span
									>
									<input
										type="text"
										class="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
										[value]="row.name"
										(input)="
											patchProviderDebounced(index, {
												name: readInput($event),
											})
										"
										(blur)="
											patchProviderFlush(index, {
												name: readInput($event),
											})
										"
									/>
								</label>
								<label class="flex flex-col gap-1">
									<span
										class="text-[10px] text-zinc-500 dark:text-zinc-400"
										>Base URL</span
									>
									<input
										type="url"
										class="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
										[value]="row.baseURL"
										(input)="
											patchProviderDebounced(index, {
												baseURL: readInput($event),
											})
										"
										(change)="
											patchProviderFlush(index, {
												baseURL: readInput($event),
											})
										"
										(blur)="
											patchProviderFlush(index, {
												baseURL: readInput($event),
											})
										"
									/>
									@if (
										connectionStatus(index);
										as connection
									) {
										<p
											class="flex items-start gap-1.5 text-[10px] leading-4"
											[class.text-zinc-500]="
												connection.state === 'idle' ||
												connection.state === 'checking'
											"
											[class.dark:text-zinc-400]="
												connection.state === 'idle' ||
												connection.state === 'checking'
											"
											[class.text-emerald-600]="
												connection.state === 'ok'
											"
											[class.dark:text-emerald-400]="
												connection.state === 'ok'
											"
											[class.text-rose-600]="
												connection.state === 'error'
											"
											[class.dark:text-rose-400]="
												connection.state === 'error'
											"
											role="status"
										>
											<span
												class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
												[class.bg-zinc-400]="
													connection.state ===
														'idle' ||
													connection.state ===
														'checking'
												"
												[class.bg-emerald-500]="
													connection.state === 'ok'
												"
												[class.bg-rose-500]="
													connection.state === 'error'
												"
												aria-hidden="true"
											></span>
											@switch (connection.state) {
												@case ('checking') {
													Checking connection…
												}
												@case ('ok') {
													Connected ({{
														connection.modelCount
													}}
													models)
												}
												@case ('error') {
													{{ connection.message }}
												}
												@default {
													Enter Base URL to test
													connection
												}
											}
										</p>
									}
								</label>
								<label class="flex flex-col gap-1">
									<span
										class="text-[10px] text-zinc-500 dark:text-zinc-400"
										>API key</span
									>
									<input
										type="password"
										autocomplete="off"
										class="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
										[placeholder]="
											row.hasApiKey
												? 'Saved — enter new value to replace'
												: 'Prefer {env:VAR_NAME}'
										"
										[value]="row.apiKey"
										(input)="
											patchProviderDebounced(index, {
												apiKey: readInput($event),
											})
										"
										(change)="
											patchProviderFlush(index, {
												apiKey: readInput($event),
											})
										"
										(blur)="
											patchProviderFlush(index, {
												apiKey: readInput($event),
											})
										"
									/>
								</label>
								<label class="flex flex-col gap-1">
									<span
										class="text-[10px] text-zinc-500 dark:text-zinc-400"
										>Models (comma-separated)</span
									>
									<input
										type="text"
										class="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
										[value]="row.modelsText"
										(input)="
											patchProviderDebounced(index, {
												modelsText: readInput($event),
											})
										"
										(blur)="
											patchProviderFlush(index, {
												modelsText: readInput($event),
											})
										"
									/>
								</label>
							</div>
						} @empty {
							@if (showProviderOnboardingHint()) {
								<div
									class="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] leading-4 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300"
									role="status"
								>
									Add an OpenAI-compatible provider (OpenAI,
									LM Studio, or similar) to unlock full
									functionality. You can still explore the
									canvas with simple nodes and Fake LLM
									without a provider; a real provider is
									required for live model runs, Sub-Agent
									workflows, and the seeded coding samples.
								</div>
							} @else {
								<p
									class="text-[11px] text-zinc-500 dark:text-zinc-400"
								>
									No providers in this scope yet.
								</p>
							}
						}
					</div>

					@if (scope() === 'project') {
						<div
							class="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800"
						>
							<span
								class="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
							>
								Project seed
							</span>
							<p
								class="text-[11px] leading-4 text-zinc-500 dark:text-zinc-400"
							>
								Re-copy packaged skeleton templates (workflows,
								skills, my-nodes, instructions). Does not change
								langflower.jsonc providers or MCP.
							</p>
							<button
								type="button"
								class="self-start rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
								[disabled]="bootstrapPending()"
								(click)="bootstrap()"
							>
								{{
									bootstrapPending()
										? 'Bootstrapping…'
										: 'Bootstrap'
								}}
							</button>
							@if (bootstrapMessage(); as message) {
								<p
									class="text-[11px] leading-4"
									[class.text-rose-600]="
										bootstrapMessageIsError()
									"
									[class.dark:text-rose-400]="
										bootstrapMessageIsError()
									"
									[class.text-zinc-600]="
										!bootstrapMessageIsError()
									"
									[class.dark:text-zinc-300]="
										!bootstrapMessageIsError()
									"
								>
									{{ message }}
								</p>
							}
						</div>
					}
				</div>
			</div>

			<div
				class="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800"
			>
				<button
					type="button"
					class="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
					[disabled]="!isDirty()"
					(click)="discard()"
				>
					Discard
				</button>
				<button
					type="button"
					class="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
					[disabled]="!isDirty()"
					(click)="save()"
				>
					Save
				</button>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfSettingsPanelComponent implements OnDestroy {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly configProjection = inject(
		LangflowerConfigProjectionService,
	);
	private readonly draftProjection = inject(ConfigDraftProjectionService);
	private readonly editorSettings = inject(EditorSettingsProjectionService);
	private readonly modelsCatalog = inject(ModelsCatalogProjectionService);

	private patchTimer: ReturnType<typeof setTimeout> | undefined;

	readonly serverLogsOptions: readonly {
		readonly value: ServerLogsDraft;
		readonly label: string;
	}[] = [
		{ value: 'off', label: 'Off' },
		{ value: 'default', label: 'Default' },
		{ value: 'on', label: 'On' },
	];

	readonly scope = this.editorSettings.scope;
	/** Optimistic local draft; authoritative fold is server draft snapshot. */
	readonly draft = signal<SettingsDraft>(configToDraft({}));
	private readonly syncedBaseline = signal<SettingsDraft>(configToDraft({}));
	readonly validationError = signal<string | null>(null);
	readonly bootstrapPending = signal(false);
	readonly bootstrapMessage = signal<string | null>(null);
	readonly bootstrapMessageIsError = signal(false);

	private readonly catalogs = toSignal(this.modelsCatalog.catalogs$, {
		initialValue: {} as Readonly<
			Record<string, LangflowerProviderModelsCatalog>
		>,
	});

	readonly globalPath = computed(
		() => this.configProjection.layers().globalPath,
	);

	/** Providers in this scope, plus an orphan id if default points elsewhere. */
	readonly defaultProviderOptions = computed(() => {
		const draft = this.draft();
		const rows = draft.providers
			.filter((row) => row.id.trim().length > 0)
			.map((row) => ({
				id: row.id,
				title: row.name.trim() || row.id,
			}));
		const selected = draft.defaultProviderId.trim();
		if (selected.length > 0 && !rows.some((row) => row.id === selected)) {
			return [{ id: selected, title: selected }, ...rows];
		}
		return rows;
	});

	readonly defaultModelOptions = computed(() => {
		const draft = this.draft();
		const providerId = draft.defaultProviderId.trim();
		if (providerId.length === 0) {
			return [];
		}
		const staticIds = defaultProviderStaticModelIds(draft);
		const fetched: readonly ProviderModelEntry[] | undefined =
			this.catalogs()[providerId]?.models;
		return mergeProviderModelOptions(staticIds, fetched);
	});

	/** Model options plus orphan selected id (so `<select>` can show/clear it). */
	readonly defaultModelSelectOptions = computed(() => {
		const options = this.defaultModelOptions();
		const selected = this.draft().defaultModelId.trim();
		if (
			selected.length > 0 &&
			!options.some((option) => option.value === selected)
		) {
			return [{ value: selected, title: selected }, ...options];
		}
		return options;
	});

	/**
	 * Onboarding copy when the scope list is empty. On Project scope, skip it
	 * when Global (or effective merge) already has providers.
	 */
	readonly showProviderOnboardingHint = computed(() => {
		if (this.scope() !== 'project') {
			return true;
		}
		const globalProviders =
			this.configProjection.layers().globalConfig.provider ?? {};
		if (Object.keys(globalProviders).length > 0) {
			return false;
		}
		// Before `langflower.config.snapshot`, session effective may already
		// include global providers.
		const effectiveProviders =
			this.configProjection.config().provider ?? {};
		return Object.keys(effectiveProviders).length === 0;
	});

	readonly isDirty = computed(() => {
		const snap = this.draftProjection.snapshot();
		return snap.scope === this.scope() ? snap.dirty : false;
	});

	constructor() {
		effect(() => {
			const snap = this.draftProjection.snapshot();
			const scope = this.scope();
			if (snap.scope !== scope) {
				return;
			}
			untracked(() => {
				const previous = this.draft();
				const previousBaseline = this.syncedBaseline();
				const incomingDraft = snap.draft as SettingsDraft;
				const incomingBaseline = snap.baseline as SettingsDraft;

				const next = sameDraft(previousBaseline, incomingBaseline)
					? mergeDraftPatch(previous, incomingDraft)
					: draftAfterLayerSnapshot(
							previous,
							previousBaseline,
							incomingBaseline,
						);

				this.draft.set(next);
				this.syncedBaseline.set(incomingBaseline);
			});
		});
	}

	ngOnDestroy(): void {
		if (this.patchTimer !== undefined) {
			clearTimeout(this.patchTimer);
		}
	}

	readonly readInput = (event: Event): string => {
		const target = event.target;
		return target instanceof HTMLInputElement ? target.value : '';
	};

	readonly readSelect = (event: Event): string => {
		const target = event.target;
		return target instanceof HTMLSelectElement ? target.value : '';
	};

	connectionStatus(index: number): ProviderConnectionStatus {
		return this.draftProjection.connectionFor(index);
	}

	private flushPatch(): void {
		if (this.patchTimer !== undefined) {
			clearTimeout(this.patchTimer);
			this.patchTimer = undefined;
		}
		this.draftProjection.emitPatch(this.scope(), this.draft());
	}

	private schedulePatch(): void {
		if (this.patchTimer !== undefined) {
			clearTimeout(this.patchTimer);
		}
		this.patchTimer = setTimeout(() => {
			this.patchTimer = undefined;
			this.draftProjection.emitPatch(this.scope(), this.draft());
		}, DRAFT_PATCH_DEBOUNCE_MS);
	}

	onDefaultProviderChange(providerId: string): void {
		const nextProvider = providerId.trim();
		const draft = this.draft();
		const nextDraft: SettingsDraft = {
			...draft,
			defaultProviderId: nextProvider,
			defaultModelId: draft.defaultModelId,
		};
		const options = mergeProviderModelOptions(
			defaultProviderStaticModelIds(nextDraft),
			this.catalogs()[nextProvider]?.models,
		);
		const modelStillValid = options.some(
			(option) => option.value === draft.defaultModelId,
		);
		this.patchDraftFlush({
			defaultProviderId: nextProvider,
			defaultModelId: modelStillValid ? draft.defaultModelId : '',
		});
	}

	setScope(next: LangflowerConfigScope): void {
		if (next === this.scope()) {
			return;
		}

		if (this.isDirty()) {
			const leave = window.confirm(
				'Discard unsaved settings changes for this scope?',
			);
			if (!leave) {
				return;
			}
			this.draftProjection.emitDiscard(this.scope());
		}

		this.validationError.set(null);
		this.syncedBaseline.set(configToDraft({}));
		this.editorSettings.requestScope(next);
	}

	patchDraft(patch: Partial<SettingsDraft>): void {
		this.patchDraftFlush(patch);
	}

	patchDraftFlush(patch: Partial<SettingsDraft>): void {
		this.draft.update((current) => ({ ...current, ...patch }));
		this.validationError.set(null);
		this.flushPatch();
	}

	patchProviderDebounced(index: number, patch: Partial<ProviderDraft>): void {
		this.applyProviderPatch(index, patch);
		this.schedulePatch();
	}

	patchProviderFlush(index: number, patch: Partial<ProviderDraft>): void {
		this.applyProviderPatch(index, patch);
		this.flushPatch();
	}

	private applyProviderPatch(
		index: number,
		patch: Partial<ProviderDraft>,
	): void {
		this.draft.update((current) => ({
			...current,
			providers: current.providers.map((row, rowIndex) =>
				rowIndex === index ? { ...row, ...patch } : row,
			),
		}));
		this.validationError.set(null);
	}

	addProvider(): void {
		this.draft.update((current) => ({
			...current,
			providers: [
				...current.providers,
				{
					id: '',
					name: '',
					baseURL: '',
					modelsText: '',
					apiKey: '',
					hasApiKey: false,
				},
			],
		}));
		this.flushPatch();
	}

	removeProvider(index: number): void {
		this.draft.update((current) => ({
			...current,
			providers: current.providers.filter(
				(_, rowIndex) => rowIndex !== index,
			),
		}));
		this.flushPatch();
	}

	discard(): void {
		this.validationError.set(null);
		this.draftProjection.emitDiscard(this.scope());
	}

	save(): void {
		this.flushPatch();
		const draft = this.draft();
		const ids = draft.providers.map((row) => row.id.trim());
		if (ids.some((id) => id.length === 0)) {
			this.validationError.set('Each provider needs a non-empty id.');
			return;
		}
		if (new Set(ids).size !== ids.length) {
			this.validationError.set('Provider ids must be unique.');
			return;
		}

		// Full payload avoids racing a trailing draft.patch against Save.
		this.bridge.raw['langflower.config.save.requested'].next(
			draftToSavePayload(this.scope(), draft),
		);
		this.validationError.set(null);
	}

	async bootstrap(): Promise<void> {
		if (this.scope() !== 'project' || this.bootstrapPending()) {
			return;
		}

		const confirmed = window.confirm(
			[
				'Restore skeleton templates into this project?',
				'',
				'This overwrites packaged workflows, skills, my-nodes, and instructions.',
				'langflower.jsonc (providers / MCP) is not changed.',
				'Stop any active run first.',
			].join('\n'),
		);

		if (!confirmed) {
			return;
		}

		this.bootstrapPending.set(true);
		this.bootstrapMessage.set(null);
		this.bootstrapMessageIsError.set(false);

		const resultPromise = firstValueFrom(
			this.bridge.raw['project.bootstrap.result'].pipe(take(1)),
		);

		this.bridge.raw['project.bootstrap.requested'].next({});

		try {
			const result = await resultPromise;

			if (result.ok) {
				this.bootstrapMessage.set('Skeleton templates restored.');
				this.bootstrapMessageIsError.set(false);
			} else {
				this.bootstrapMessage.set(result.message);
				this.bootstrapMessageIsError.set(true);
			}
		} catch {
			this.bootstrapMessage.set(
				'Bootstrap failed — no response from server.',
			);
			this.bootstrapMessageIsError.set(true);
		} finally {
			this.bootstrapPending.set(false);
		}
	}

	onClose(): void {
		if (this.isDirty()) {
			const leave = window.confirm('Discard unsaved settings changes?');
			if (!leave) {
				return;
			}
			this.draftProjection.emitDiscard(this.scope());
		}
		this.editorSettings.requestClose();
	}
}
