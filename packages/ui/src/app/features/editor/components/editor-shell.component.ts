import { AsyncPipe } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	HostListener,
	computed,
	effect,
	inject,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import type { DividerPositions } from '@langflower/shared/langflower';
import { tap } from 'rxjs';
import { EditorSettingsProjectionService } from '../../../services/editor-settings-projection.service';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { LangflowerConfigProjectionService } from '../../../services/langflower-config-projection.service';
import { ModelsCatalogProjectionService } from '../../../services/models-catalog-projection.service';
import { SelectedNodeProjectionService } from '../../../services/selected-node-projection.service';
import { ThemeService } from '../../../services/theme.service';
import { LfCanvasContainerComponent } from '../../canvas/components/lf-canvas-container.component';
import { PaletteSidebarComponent } from '../../palette/components/palette-sidebar.component';
import { LfInspectorPanelComponent } from '../../sidebar/components/lf-inspector-panel.component';
import { LfSettingsPanelComponent } from '../../sidebar/components/lf-settings-panel.component';
import { LfWorkLogPanelComponent } from '../../sidebar/components/lf-work-log-panel.component';
import { ProjectDirComponent } from '../../topbar/components/project-dir.component';
import { WorkflowTopbarComponent } from '../../topbar/components/workflow-topbar.component';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { LfComposerShellComponent } from './lf-composer-shell.component';
import {
	clampDividerDrag,
	clampDividerPositionsToViewport,
	sameDividerPositions,
	type DividerResizeTarget,
} from '../utils/clamp-divider-positions.js';
import {
	DEFAULT_WS_SERVER_POKE_INTERVAL_MS,
	startWsServerPoke,
	type WsServerPokeHandle,
} from '../utils/ws-server-poke.js';

type ResizeDrag = {
	readonly target: DividerResizeTarget;
	readonly startX: number;
	readonly startY: number;
	readonly startSize: number;
};

type MeasuredLayout = {
	readonly rowWidth: number;
	readonly rightAsideHeight: number;
};

@Component({
	selector: 'lf-editor-shell',
	standalone: true,
	imports: [
		AsyncPipe,
		ProjectDirComponent,
		WorkflowTopbarComponent,
		PaletteSidebarComponent,
		LfCanvasContainerComponent,
		LfInspectorPanelComponent,
		LfSettingsPanelComponent,
		LfWorkLogPanelComponent,
		LfComposerShellComponent,
		LfHoverTipComponent,
	],
	template: `
		<div
			class="relative flex h-screen flex-col overflow-hidden bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100"
		>
			@if (connectionStatus() === 'disconnected') {
				<div
					class="absolute inset-0 z-50 flex items-center justify-center bg-zinc-50/90 px-6 dark:bg-zinc-950/90"
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="lf-disconnect-title"
					aria-describedby="lf-disconnect-body"
				>
					<div
						class="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
					>
						<h2
							id="lf-disconnect-title"
							class="inline-flex items-center justify-center gap-2 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100"
						>
							<span
								class="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400"
								aria-hidden="true"
							></span>
							Disconnected
						</h2>
						<p
							id="lf-disconnect-body"
							class="mt-2 text-sm text-zinc-600 dark:text-zinc-400"
						>
							The server is unreachable. The editor is blocked
							while we retry the connection. The page will reload
							when the server returns.
						</p>
					</div>
				</div>
			}

			<header
				class="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900"
			>
				<div class="flex min-w-0 flex-1 items-center gap-4">
					<h1 class="text-base font-semibold tracking-tight">
						Langflower
					</h1>
					<lf-project-dir class="shrink-0" />
					<lf-workflow-topbar class="min-w-0 flex-1" />
				</div>

				<div class="flex items-center gap-3 text-xs">
					<div
						class="flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
					>
						<span
							class="h-2 w-2 rounded-full"
							[class.bg-amber-400]="
								connectionStatus() === 'connecting'
							"
							[class.bg-emerald-400]="
								connectionStatus() === 'connected'
							"
							[class.bg-rose-400]="
								connectionStatus() === 'disconnected'
							"
						></span>
						<span>{{ connectionStatus() }}</span>
					</div>

					<lf-hover-tip
						side="bottom"
						[tip]="
							theme() === 'dark'
								? 'Switch to light theme'
								: 'Switch to dark theme'
						"
					>
						<button
							type="button"
							class="rounded-md border border-zinc-200 px-3 py-1 font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
							(click)="toggleTheme()"
						>
							{{ themeButtonLabel() }}
						</button>
					</lf-hover-tip>

					<lf-hover-tip side="bottom" tip="Settings">
						<button
							type="button"
							class="rounded-md border border-zinc-200 p-1.5 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
							[class.bg-zinc-100]="settingsOpen()"
							[class.dark:bg-zinc-800]="settingsOpen()"
							aria-label="Settings"
							[attr.aria-pressed]="settingsOpen()"
							(click)="toggleSettings()"
						>
							<svg
								viewBox="0 0 20 20"
								class="h-4 w-4"
								fill="currentColor"
								aria-hidden="true"
							>
								<path
									fill-rule="evenodd"
									d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.34 1.353l-1.267.903a7.068 7.068 0 0 1 0 2.218l1.267.903a1 1 0 0 1 .34 1.353l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .34-1.353l1.267-.903a7.068 7.068 0 0 1 0-2.218l-1.267-.903a1 1 0 0 1-.34-1.353l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54a6.993 6.993 0 0 1 1.929-1.115l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
					</lf-hover-tip>
				</div>
			</header>

			@if (sessionSnapshot$ | async; as sessionSnapshot) {
				<div #editorRow class="flex min-h-0 flex-1">
					<aside
						class="flex min-h-0 min-w-[120px] shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
						[style.width.px]="
							leftWidth() ??
							sessionSnapshot.dividerPositions.leftWidth
						"
					>
						<section class="flex h-full min-h-0 flex-col p-4">
							<lf-palette-sidebar />
						</section>
					</aside>

					<button
						type="button"
						aria-label="Resize left sidebar"
						class="w-1 cursor-col-resize bg-zinc-200 transition hover:bg-zinc-400 dark:bg-zinc-800 dark:hover:bg-zinc-500"
						(pointerdown)="startResize($event, 'left')"
					></button>

					<main
						class="relative min-w-0 flex-1 overflow-hidden bg-zinc-100 dark:bg-zinc-950"
					>
						<section class="relative h-full min-h-0">
							<lf-canvas-container />
						</section>
					</main>

					<button
						type="button"
						aria-label="Resize right sidebar"
						class="w-1 cursor-col-resize bg-zinc-200 transition hover:bg-zinc-400 dark:bg-zinc-800 dark:hover:bg-zinc-500"
						(pointerdown)="startResize($event, 'right')"
					></button>

					<aside
						#rightAside
						class="flex min-w-[120px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
						[style.width.px]="
							rightWidth() ??
							sessionSnapshot.dividerPositions.rightWidth
						"
					>
						@if (settingsOpen()) {
							<section
								class="lf-scroll min-h-0 flex-1 overflow-y-auto p-4"
							>
								<lf-settings-panel />
							</section>
						} @else if (hasSelectedNode()) {
							<section
								class="lf-scroll min-h-0 flex-1 overflow-y-auto p-4"
							>
								<lf-inspector-panel />
							</section>
						} @else {
							<section
								class="min-h-0 flex-1 overflow-hidden px-2 py-4"
							>
								<lf-work-log-panel />
							</section>
						}

						<button
							type="button"
							aria-label="Resize awaiting-input panel"
							class="h-1 cursor-row-resize bg-zinc-200 transition hover:bg-zinc-400 dark:bg-zinc-800 dark:hover:bg-zinc-500"
							(pointerdown)="startResize($event, 'composer')"
						></button>

						<lf-composer-shell
							[height]="
								composerHeight() ??
								sessionSnapshot.dividerPositions.composerHeight
							"
						/>
					</aside>
				</div>
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorShellComponent {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly themeService = inject(ThemeService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly activeResize = signal<ResizeDrag | null>(null);
	private readonly editorRow =
		viewChild<ElementRef<HTMLElement>>('editorRow');
	private readonly rightAside =
		viewChild<ElementRef<HTMLElement>>('rightAside');
	private layoutObserver: ResizeObserver | null = null;
	private persistTimer: ReturnType<typeof setTimeout> | null = null;
	private serverPoke: WsServerPokeHandle | null = null;

	/**
	 * Real bootstrap fact — layout mounts only after async materializes this.
	 * Clear local overrides so the template alias is the source of truth again
	 * (reconnect / fresh session.dividerPositions).
	 */
	readonly sessionSnapshot$ = this.bridge.cached[
		'session.state.snapshot'
	].pipe(
		tap(() => {
			if (this.activeResize() !== null) {
				return;
			}
			this.leftWidth.set(null);
			this.rightWidth.set(null);
			this.composerHeight.set(null);
		}),
	);

	readonly connectionStatus = toSignal(this.bridge.raw.status$, {
		initialValue: 'connecting',
	});
	readonly theme = toSignal(this.themeService.theme$, {
		initialValue: this.themeService.snapshot,
	});
	readonly themeButtonLabel = computed(() =>
		this.theme() === 'dark' ? 'Light' : 'Dark',
	);

	/**
	 * Local overrides after drag / cross-tab / viewport reclamp.
	 * First paint uses `sessionSnapshot.dividerPositions` from the async alias.
	 */
	readonly leftWidth = signal<number | null>(null);
	readonly rightWidth = signal<number | null>(null);
	readonly composerHeight = signal<number | null>(null);

	private readonly selection = inject(SelectedNodeProjectionService);
	private readonly editorSettings = inject(EditorSettingsProjectionService);
	readonly hasSelectedNode = this.selection.hasSelectedNode;
	readonly settingsOpen = this.editorSettings.open;

	constructor() {
		// Warm config / models-catalog projections before Inspector mounts.
		// Selection / settings are warmed by field injects.
		inject(LangflowerConfigProjectionService);
		inject(ModelsCatalogProjectionService);

		// Cross-tab divider sync (after layout is up).
		this.bridge.cached['editor.dividers.snapshot']
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((positions) => {
				this.applyDividerPositions(positions);
			});

		// Attach measure only once #editorRow exists (after session snapshot).
		effect(() => {
			const row = this.editorRow();
			const aside = this.rightAside();
			if (row === undefined || aside === undefined) {
				return;
			}

			untracked(() => {
				this.attachLayoutObserver();
				this.reclampToViewport(true);
			});
		});

		// While disconnected, probe /ws and reload when the server returns.
		effect(() => {
			const disconnected = this.connectionStatus() === 'disconnected';
			untracked(() => {
				if (disconnected) {
					this.startServerPoke();
					return;
				}
				this.stopServerPoke();
			});
		});

		this.destroyRef.onDestroy(() => {
			this.stopServerPoke();
			this.layoutObserver?.disconnect();
			this.layoutObserver = null;
			if (this.persistTimer !== null) {
				clearTimeout(this.persistTimer);
				this.persistTimer = null;
			}
		});
	}

	reloadPage(): void {
		window.location.reload();
	}

	private startServerPoke(): void {
		if (this.serverPoke !== null) {
			return;
		}
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${protocol}//${window.location.host}/ws`;
		this.serverPoke = startWsServerPoke({
			url,
			intervalMs: DEFAULT_WS_SERVER_POKE_INTERVAL_MS,
			onReachable: () => {
				this.reloadPage();
			},
		});
	}

	private stopServerPoke(): void {
		this.serverPoke?.stop();
		this.serverPoke = null;
	}

	toggleSettings(): void {
		if (this.settingsOpen()) {
			this.editorSettings.requestClose();
			return;
		}

		this.editorSettings.requestOpen('project');
	}

	toggleTheme(): void {
		this.themeService.toggleTheme();
	}

	startResize(event: PointerEvent, target: DividerResizeTarget): void {
		event.preventDefault();

		const startSize = this.currentSize(target);
		if (startSize === null) {
			return;
		}

		this.activeResize.set({
			target,
			startX: event.clientX,
			startY: event.clientY,
			startSize,
		});
	}

	@HostListener('document:pointermove', ['$event'])
	protected handlePointerMove(event: PointerEvent): void {
		const drag = this.activeResize();

		if (drag === null) {
			return;
		}

		const layout = this.readLayout();
		const current = this.currentDividerPositions();
		if (layout === null || current === null) {
			return;
		}

		if (drag.target === 'left') {
			this.leftWidth.set(
				clampDividerDrag(
					'left',
					drag.startSize + event.clientX - drag.startX,
					current,
					layout,
				),
			);
			return;
		}

		if (drag.target === 'right') {
			this.rightWidth.set(
				clampDividerDrag(
					'right',
					drag.startSize - event.clientX + drag.startX,
					current,
					layout,
				),
			);
			return;
		}

		this.composerHeight.set(
			clampDividerDrag(
				'composer',
				drag.startSize - event.clientY + drag.startY,
				current,
				layout,
			),
		);
	}

	@HostListener('document:pointerup')
	protected handlePointerUp(): void {
		const drag = this.activeResize();
		this.activeResize.set(null);

		if (drag !== null) {
			this.persistDividers();
		}
	}

	private currentSize(target: DividerResizeTarget): number | null {
		if (target === 'left') {
			const override = this.leftWidth();
			if (override !== null) {
				return override;
			}
			const row = this.editorRow()?.nativeElement;
			const leftAside = row?.children[0] as HTMLElement | undefined;
			return leftAside?.clientWidth ?? null;
		}

		if (target === 'right') {
			const override = this.rightWidth();
			if (override !== null) {
				return override;
			}
			return this.rightAside()?.nativeElement.clientWidth ?? null;
		}

		const override = this.composerHeight();
		if (override !== null) {
			return override;
		}

		const aside = this.rightAside()?.nativeElement;
		const composer = aside?.lastElementChild as HTMLElement | undefined;
		return composer?.clientHeight ?? null;
	}

	private currentDividerPositions(): DividerPositions | null {
		const leftWidth = this.currentSize('left');
		const rightWidth = this.currentSize('right');
		const composerHeight = this.currentSize('composer');
		if (
			leftWidth === null ||
			rightWidth === null ||
			composerHeight === null
		) {
			return null;
		}

		return { leftWidth, rightWidth, composerHeight };
	}

	private readLayout(): MeasuredLayout | null {
		const row = this.editorRow()?.nativeElement;
		const aside = this.rightAside()?.nativeElement;
		if (row === undefined || aside === undefined) {
			return null;
		}

		return {
			rowWidth: row.clientWidth,
			rightAsideHeight: aside.clientHeight,
		};
	}

	private applyDividerPositions(positions: DividerPositions): void {
		if (this.activeResize() !== null) {
			return;
		}

		// Inbound cross-tab sync: clamp for local display only when the row is
		// measured. Never echo-persist here — fallback measure before mount can
		// clobber shared dividers (BUG-2026-06-26i). Persist stays on user drag
		// end and post-measure `reclampToViewport(true)`.
		const layout = this.readLayout();
		if (layout === null) {
			this.leftWidth.set(positions.leftWidth);
			this.rightWidth.set(positions.rightWidth);
			this.composerHeight.set(positions.composerHeight);
			return;
		}

		const next = clampDividerPositionsToViewport(positions, layout);
		this.leftWidth.set(next.leftWidth);
		this.rightWidth.set(next.rightWidth);
		this.composerHeight.set(next.composerHeight);
	}

	private reclampToViewport(persist: boolean): void {
		if (this.activeResize() !== null) {
			return;
		}

		const layout = this.readLayout();
		const current = this.currentDividerPositions();
		if (layout === null || current === null) {
			return;
		}

		const next = clampDividerPositionsToViewport(current, layout);

		if (sameDividerPositions(current, next)) {
			return;
		}

		this.leftWidth.set(next.leftWidth);
		this.rightWidth.set(next.rightWidth);
		this.composerHeight.set(next.composerHeight);

		if (persist) {
			this.schedulePersistDividers();
		}
	}

	private attachLayoutObserver(): void {
		const row = this.editorRow()?.nativeElement;
		const aside = this.rightAside()?.nativeElement;

		if (row === undefined || aside === undefined) {
			return;
		}

		this.layoutObserver?.disconnect();
		this.layoutObserver = new ResizeObserver(() => {
			this.reclampToViewport(true);
		});
		this.layoutObserver.observe(row);
		this.layoutObserver.observe(aside);
	}

	private schedulePersistDividers(): void {
		if (this.persistTimer !== null) {
			clearTimeout(this.persistTimer);
		}

		this.persistTimer = setTimeout(() => {
			this.persistTimer = null;
			this.persistDividers();
		}, 100);
	}

	private persistDividers(): void {
		const positions = this.currentDividerPositions();
		if (positions === null) {
			return;
		}

		this.bridge.raw['editor.dividers.requested'].next(positions);
	}
}
