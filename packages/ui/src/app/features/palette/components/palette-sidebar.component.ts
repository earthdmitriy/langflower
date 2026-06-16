import {
	ApplicationRef,
	ChangeDetectionStrategy,
	Component,
	EnvironmentInjector,
	HostListener,
	computed,
	effect,
	inject,
	signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type {
	PaletteNodeDefinition,
	PaletteNodeSource,
} from '@langflower/shared/langflower';
import { combineLatest, map, startWith } from 'rxjs';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import {
	ADVANCED_CATEGORY,
	advancedSubcategoryCollapseKey,
	categoryCollapseKey,
	emptyCustomPaletteSnapshot,
	filterPaletteSections,
	initialPaletteSidebarState,
	paletteFromSystemAndCustom,
	sourceSectionLabel,
	type PaletteCategoryGroup,
	type PaletteSourceSection,
} from '../types/palette-projection';
import {
	attachPaletteDragImage,
	type PaletteDragImageSession,
} from '../utils/palette-drag-image.js';
import { PALETTE_DRAG_MIME } from '../utils/palette-drag-mime.js';
import {
	PaletteNodeDetailPopoverComponent,
	type PalettePopoverAnchor,
} from './palette-node-detail-popover.component';

type HoverTarget = {
	readonly node: PaletteNodeDefinition;
	readonly anchor: PalettePopoverAnchor;
};

const CATEGORY_HEADER_CLASS =
	'flex w-full items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200';

const NODE_ROW_CLASS =
	'w-full cursor-grab rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-left text-[11px] text-zinc-800 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50 active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-800';

const CHEVRON_PATH =
	'M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z';

@Component({
	selector: 'lf-palette-sidebar',
	standalone: true,
	imports: [PaletteNodeDetailPopoverComponent],
	host: {
		class: 'block h-full min-h-0',
	},
	template: `
		<div class="relative flex h-full min-h-0 flex-col">
			<h2
				class="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
			>
				Palette
			</h2>

			<input
				type="search"
				class="mt-3 w-full shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
				placeholder="Filter nodes…"
				[value]="filterQuery()"
				(input)="onFilterInput($event)"
			/>

			<div class="lf-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
				@for (section of visibleSections(); track section.source) {
					<div class="mb-2">
						<button
							type="button"
							class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
							[attr.aria-expanded]="
								isSourceExpanded(section.source)
							"
							(click)="toggleSource(section.source)"
						>
							<span>{{
								sourceSectionLabel(section.source)
							}}</span>
							<svg
								viewBox="0 0 20 20"
								class="h-3.5 w-3.5 shrink-0 transition"
								[class.rotate-180]="
									isSourceExpanded(section.source)
								"
								fill="currentColor"
								aria-hidden="true"
							>
								<path [attr.d]="chevronPath" />
							</svg>
						</button>

						@if (isSourceExpanded(section.source)) {
							@if (section.source === 'custom') {
								<div
									class="flex items-center justify-between gap-2 py-1 pl-4 pr-2"
								>
									<span
										class="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
									>
										{{ customStatusLabel() }}
									</span>
									<button
										type="button"
										class="rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
										[disabled]="
											customStatus() === 'compiling'
										"
										(click)="requestCustomPaletteUpdate()"
									>
										Update
									</button>
								</div>
								@if (customErrors().length > 0) {
									<ul
										class="mb-1 space-y-1 py-1 pl-4 pr-2 text-[11px] text-red-700 dark:text-red-300"
									>
										@for (
											error of customErrors();
											track error.packageName +
												error.message
										) {
											<li class="whitespace-pre-wrap">
												<strong>{{
													error.packageName
												}}</strong>
												<pre
													class="mt-0.5 font-sans whitespace-pre-wrap"
													>{{ error.message }}</pre>
											</li>
										}
									</ul>
								}
							}
							@if (section.categories.length === 0) {
								@if (section.source === 'custom') {
									<p
										class="py-1 pl-4 pr-2 text-[11px] text-zinc-500 dark:text-zinc-400"
									>
										No custom nodes yet
									</p>
								}
							} @else {
								@for (
									group of section.categories;
									track group.category
								) {
									<div class="mt-1.5 pl-4">
										<button
											type="button"
											[class]="categoryHeaderClass"
											[attr.aria-expanded]="
												isCategoryExpanded(
													section.source,
													group.category
												)
											"
											(click)="
												toggleCategory(
													section.source,
													group.category
												)
											"
										>
											<span>{{ group.category }}</span>
											<svg
												viewBox="0 0 20 20"
												class="h-2.5 w-2.5 shrink-0 transition"
												[class.rotate-180]="
													isCategoryExpanded(
														section.source,
														group.category
													)
												"
												fill="currentColor"
												aria-hidden="true"
											>
												<path [attr.d]="chevronPath" />
											</svg>
										</button>

										@if (
											isCategoryExpanded(
												section.source,
												group.category
											)
										) {
											@if (isAdvancedGroup(group)) {
												@for (
													sub of group.subcategories!;
													track sub.category
												) {
													<div class="mt-1 pl-4">
														<button
															type="button"
															[class]="
																categoryHeaderClass
															"
															[attr.aria-expanded]="
																isAdvancedSubcategoryExpanded(
																	section.source,
																	sub.category
																)
															"
															(click)="
																toggleAdvancedSubcategory(
																	section.source,
																	sub.category
																)
															"
														>
															<span>{{
																sub.category
															}}</span>
															<svg
																viewBox="0 0 20 20"
																class="h-2.5 w-2.5 shrink-0 transition"
																[class.rotate-180]="
																	isAdvancedSubcategoryExpanded(
																		section.source,
																		sub.category
																	)
																"
																fill="currentColor"
																aria-hidden="true"
															>
																<path
																	[attr.d]="
																		chevronPath
																	"
																/>
															</svg>
														</button>

														@if (
															isAdvancedSubcategoryExpanded(
																section.source,
																sub.category
															)
														) {
															<ul
																class="mt-1 space-y-1 pl-4"
															>
																@for (
																	entry of sub.nodes;
																	track entry.type
																) {
																	<li>
																		<button
																			type="button"
																			draggable="true"
																			[class]="
																				nodeRowClass
																			"
																			(dragstart)="
																				startPaletteDrag(
																					entry,
																					$event
																				)
																			"
																			(dragend)="
																				endPaletteDrag()
																			"
																			(mouseenter)="
																				showPopover(
																					entry,
																					$event
																				)
																			"
																			(mouseleave)="
																				hidePopover()
																			"
																			(click)="
																				togglePinnedPopover(
																					entry,
																					$event
																				)
																			"
																		>
																			{{
																				entry.displayName
																			}}
																		</button>
																	</li>
																}
															</ul>
														}
													</div>
												}
											} @else {
												<ul class="mt-1 space-y-1 pl-4">
													@for (
														entry of group.nodes;
														track entry.type
													) {
														<li>
															<button
																type="button"
																draggable="true"
																[class]="
																	nodeRowClass
																"
																(dragstart)="
																	startPaletteDrag(
																		entry,
																		$event
																	)
																"
																(dragend)="
																	endPaletteDrag()
																"
																(mouseenter)="
																	showPopover(
																		entry,
																		$event
																	)
																"
																(mouseleave)="
																	hidePopover()
																"
																(click)="
																	togglePinnedPopover(
																		entry,
																		$event
																	)
																"
															>
																{{
																	entry.displayName
																}}
															</button>
														</li>
													}
												</ul>
											}
										}
									</div>
								}
							}
						}
					</div>
				}
			</div>

			<lf-palette-node-detail-popover
				[node]="popoverNode()"
				[anchor]="popoverAnchor()"
				(panelEnter)="popoverHovered.set(true)"
				(panelLeave)="onPopoverPanelLeave()"
			/>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaletteSidebarComponent {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly appRef = inject(ApplicationRef);
	private readonly environmentInjector = inject(EnvironmentInjector);
	private seededCategoryExpansion = false;
	private dragImageSession: PaletteDragImageSession | null = null;

	readonly categoryHeaderClass = CATEGORY_HEADER_CLASS;
	readonly nodeRowClass = NODE_ROW_CLASS;
	readonly chevronPath = CHEVRON_PATH;

	readonly expandedSources = signal<ReadonlySet<PaletteNodeSource>>(
		new Set(['system']),
	);
	readonly expandedCategories = signal<ReadonlySet<string>>(new Set());
	readonly filterQuery = signal('');
	readonly hoverTarget = signal<HoverTarget | null>(null);
	readonly pinnedTarget = signal<HoverTarget | null>(null);
	readonly popoverHovered = signal(false);

	private readonly paletteState = toSignal(
		combineLatest([
			this.bridge.cached['palette.snapshot'].pipe(
				startWith({ nodes: [] as const }),
			),
			this.bridge.cached['customPalette.snapshot'].pipe(
				startWith(emptyCustomPaletteSnapshot),
			),
		]).pipe(
			map(([system, custom]) =>
				paletteFromSystemAndCustom(system, custom),
			),
			startWith(initialPaletteSidebarState),
		),
		{ initialValue: initialPaletteSidebarState },
	);

	readonly sections = computed(
		(): readonly PaletteSourceSection[] => this.paletteState().sections,
	);

	readonly customStatus = computed(() => this.paletteState().customStatus);

	readonly customErrors = computed(() => this.paletteState().customErrors);

	readonly customStatusLabel = computed((): string => {
		switch (this.customStatus()) {
			case 'compiling':
				return 'Compiling…';
			case 'ok':
				return 'Compiled';
			case 'partial':
				return 'Partial (some errors)';
			case 'error':
				return 'Compile error';
			default:
				return 'Not compiled';
		}
	});

	readonly visibleSections = computed((): readonly PaletteSourceSection[] =>
		filterPaletteSections(this.sections(), this.filterQuery()),
	);

	private readonly isFiltering = computed(
		(): boolean => this.filterQuery().trim().length > 0,
	);

	constructor() {
		effect(() => {
			if (this.seededCategoryExpansion) {
				return;
			}

			const keys = new Set<string>();

			for (const section of this.sections()) {
				for (const group of section.categories) {
					if (group.category === ADVANCED_CATEGORY) {
						for (const sub of group.subcategories ?? []) {
							keys.add(
								advancedSubcategoryCollapseKey(
									section.source,
									sub.category,
								),
							);
						}
						continue;
					}

					keys.add(
						categoryCollapseKey(section.source, group.category),
					);
				}
			}

			if (keys.size === 0) {
				return;
			}

			this.expandedCategories.set(keys);
			this.seededCategoryExpansion = true;
		});
	}

	onFilterInput(event: Event): void {
		const target = event.target;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		this.filterQuery.set(target.value);
	}

	requestCustomPaletteUpdate(): void {
		this.bridge.raw['customPalette.update.requested'].next({});
	}

	readonly popoverNode = computed(
		(): PaletteNodeDefinition | null =>
			this.pinnedTarget()?.node ?? this.hoverTarget()?.node ?? null,
	);

	readonly popoverAnchor = computed((): PalettePopoverAnchor | null => {
		const target = this.pinnedTarget() ?? this.hoverTarget();

		return target?.anchor ?? null;
	});

	readonly sourceSectionLabel = sourceSectionLabel;

	isAdvancedGroup(group: PaletteCategoryGroup): boolean {
		return group.category === ADVANCED_CATEGORY;
	}

	isSourceExpanded(source: PaletteNodeSource): boolean {
		return this.isFiltering() || this.expandedSources().has(source);
	}

	isCategoryExpanded(source: PaletteNodeSource, category: string): boolean {
		return (
			this.isFiltering() ||
			this.expandedCategories().has(categoryCollapseKey(source, category))
		);
	}

	isAdvancedSubcategoryExpanded(
		source: PaletteNodeSource,
		subcategory: string,
	): boolean {
		return (
			this.isFiltering() ||
			this.expandedCategories().has(
				advancedSubcategoryCollapseKey(source, subcategory),
			)
		);
	}

	toggleSource(source: PaletteNodeSource): void {
		this.expandedSources.update((current) => {
			const next = new Set(current);

			if (next.has(source)) {
				next.delete(source);
			} else {
				next.add(source);
			}

			return next;
		});
	}

	toggleCategory(source: PaletteNodeSource, category: string): void {
		this.toggleCollapseKey(categoryCollapseKey(source, category));
	}

	toggleAdvancedSubcategory(
		source: PaletteNodeSource,
		subcategory: string,
	): void {
		this.toggleCollapseKey(
			advancedSubcategoryCollapseKey(source, subcategory),
		);
	}

	private toggleCollapseKey(key: string): void {
		this.expandedCategories.update((current) => {
			const next = new Set(current);

			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}

			return next;
		});
	}

	startPaletteDrag(node: PaletteNodeDefinition, event: DragEvent): void {
		if (event.dataTransfer === null) {
			return;
		}

		this.dismissPopover();

		event.dataTransfer.setData(PALETTE_DRAG_MIME, node.type);
		event.dataTransfer.effectAllowed = 'copy';

		this.endPaletteDrag();
		this.dragImageSession = attachPaletteDragImage(
			this.environmentInjector,
			this.appRef,
			node,
			event,
		);
	}

	endPaletteDrag(): void {
		this.dragImageSession?.destroy();
		this.dragImageSession = null;
	}

	dismissPopover(): void {
		this.hoverTarget.set(null);
		this.pinnedTarget.set(null);
		this.popoverHovered.set(false);
	}

	showPopover(node: PaletteNodeDefinition, event: MouseEvent): void {
		if (this.pinnedTarget() !== null) {
			return;
		}

		const element = event.currentTarget;

		if (!(element instanceof HTMLElement)) {
			return;
		}

		const rect = element.getBoundingClientRect();

		this.hoverTarget.set({
			node,
			anchor: {
				top: rect.top,
				left: rect.left,
				height: rect.height,
				width: rect.width,
			},
		});
	}

	hidePopover(): void {
		if (this.pinnedTarget() !== null || this.popoverHovered()) {
			return;
		}

		this.hoverTarget.set(null);
	}

	onPopoverPanelLeave(): void {
		this.popoverHovered.set(false);
		this.hidePopover();
	}

	togglePinnedPopover(node: PaletteNodeDefinition, event: MouseEvent): void {
		const element = event.currentTarget;

		if (!(element instanceof HTMLElement)) {
			return;
		}

		const rect = element.getBoundingClientRect();
		const next: HoverTarget = {
			node,
			anchor: {
				top: rect.top,
				left: rect.left,
				height: rect.height,
				width: rect.width,
			},
		};
		const pinned = this.pinnedTarget();

		if (pinned?.node.type === node.type) {
			this.pinnedTarget.set(null);
			this.hoverTarget.set(null);
			return;
		}

		this.pinnedTarget.set(next);
		this.hoverTarget.set(null);
	}

	@HostListener('document:keydown.escape')
	protected handleEscape(): void {
		this.dismissPopover();
	}
}
