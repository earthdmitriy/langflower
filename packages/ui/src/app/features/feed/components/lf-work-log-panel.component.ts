import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	Injector,
	NgZone,
	computed,
	inject,
	signal,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, auditTime, debounceTime } from 'rxjs';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component.js';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service.js';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service.js';
import { ExecutionFeedService } from '../../feed-folding/execution-feed.service.js';
import type { FeedRow } from '../../feed-folding/types.js';
import {
	pinGestureFromScrollKey,
	pinGestureFromTouchDelta,
	pinGestureFromWheelDelta,
	type FeedPinGesture,
} from '../feed-pin-gesture.js';
import {
	FEED_WINDOW_SLIDE_AUDIT_MS,
	emptyFeedWindow,
	feedWindowDragSlideEdge,
	formatFeedWindowProgress,
	isFeedPinnedToTail,
	nextWindowFromAnchor,
	retainFeedWindow,
	sameFeedWindow,
	shouldRecenterWindow,
	sliceFeedWindow,
	slideFeedWindowByOne,
	sumRowHeights,
	visibleFeedRange,
	windowAroundVisible,
	type FeedWindow,
	type FeedWindowSlideEdge,
} from '../feed-window.js';
import { isVerticalScrollbarHit } from '../is-vertical-scrollbar-hit.js';
import { LfFeedRowComponent } from './lf-feed-row.component.js';

@Component({
	selector: 'lf-work-log-panel',
	standalone: true,
	imports: [LfHoverTipComponent, LfFeedRowComponent],
	host: { class: 'block h-full min-h-0' },
	template: `
		<div class="flex h-full min-h-0 flex-col">
			<div class="mb-2 flex shrink-0 items-center justify-between gap-2">
				<span
					class="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200"
					>Work log</span
				>
				@if (!execution.isRunning()) {
					<lf-hover-tip
						side="left"
						align="center"
						tip="Clear the work log"
					>
						<button
							type="button"
							class="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
							(click)="clearFeed()"
						>
							Clear
						</button>
					</lf-hover-tip>
				}
			</div>

			@if (rows().length === 0) {
				<p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
					Run the workflow to see execution progress here.
				</p>
			} @else {
				<div
					class="relative flex min-h-0 flex-1 flex-col overflow-hidden"
				>
					<div
						#feedViewport
						tabindex="0"
						class="lf-feed-viewport lf-scroll min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
						(scroll)="onScroll()"
						(wheel)="onWheel($event)"
						(keydown)="onKeyDown($event)"
						(touchstart)="onTouchStart($event)"
						(touchmove)="onTouchMove($event)"
						(pointerdown)="onPointerDown($event)"
						(pointerup)="onPointerUp()"
						(pointercancel)="onPointerUp()"
					>
						@if (hasOlderRows()) {
							<p
								class="px-1 py-2 text-center text-[10px] text-zinc-400 dark:text-zinc-500"
							>
								{{ olderProgressLabel() }}
							</p>
						}
						<div
							#feedList
							class="lf-feed-window w-full min-w-0 max-w-full"
							[class.min-h-full]="alignTailToBottom()"
							[class.flex]="alignTailToBottom()"
							[class.flex-col]="alignTailToBottom()"
							[class.justify-end]="alignTailToBottom()"
						>
							@for (row of visibleRows(); track row.rowId) {
								<lf-feed-row
									[row]="row"
									[openKeys]="openKeys()"
									(detailsOpenChange)="
										onDetailsOpenChange($event)
									"
								/>
							}
						</div>
						@if (hasNewerRows()) {
							<p
								class="px-1 py-2 text-center text-[10px] text-zinc-400 dark:text-zinc-500"
							>
								{{ newerProgressLabel() }}
							</p>
						}
					</div>

					@if (!pinnedToBottom()) {
						<div class="absolute bottom-1 z-10">
							<lf-hover-tip
								side="right"
								align="start"
								tip="Jump to the latest events"
							>
								<button
									type="button"
									class="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
									(click)="scrollToBottom()"
								>
									↓ New events
								</button>
							</lf-hover-tip>
						</div>
					}
				</div>
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfWorkLogPanelComponent {
	readonly feed = inject(ExecutionFeedService);
	readonly execution = inject(WorkflowExecutionService);
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly ngZone = inject(NgZone);
	private readonly injector = inject(Injector);

	readonly pinnedToBottom = signal(true);
	readonly openKeys = signal<ReadonlySet<string>>(new Set());
	readonly rows = signal<readonly FeedRow[]>([]);
	readonly visibleRows = computed(() =>
		sliceFeedWindow(this.rows(), this.feedWindow()),
	);
	readonly alignTailToBottom = computed(() => {
		if (!this.pinnedToBottom()) {
			return false;
		}

		const rows = this.rows();
		const window = this.feedWindow();
		if (rows.length === 0 || window.end !== rows.length) {
			return false;
		}

		const viewport = this.viewportPx();
		if (viewport <= 0) {
			return false;
		}

		const height = sumRowHeights(
			this.rowIdList(rows),
			window.start,
			window.end,
			this.rowHeights(),
		);
		return height > 0 && height <= viewport;
	});
	readonly hasOlderRows = computed(() => this.feedWindow().start > 0);
	readonly hasNewerRows = computed(() => {
		const rows = this.rows();
		const window = this.feedWindow();
		return rows.length > 0 && window.end < rows.length;
	});
	readonly olderProgressLabel = computed(() =>
		formatFeedWindowProgress(
			this.feedWindow(),
			this.rows().length,
			'start',
		),
	);
	readonly newerProgressLabel = computed(() =>
		formatFeedWindowProgress(this.feedWindow(), this.rows().length, 'end'),
	);

	private readonly feedWindow = signal(emptyFeedWindow());
	private readonly rowHeights = signal<ReadonlyMap<string, number>>(
		new Map(),
	);
	private readonly viewportRef =
		viewChild<ElementRef<HTMLElement>>('feedViewport');
	private readonly listRef = viewChild<ElementRef<HTMLElement>>('feedList');
	private readonly layout$ = new Subject<void>();
	private readonly slide$ = new Subject<void>();
	private resizeObserver: ResizeObserver | undefined;
	private observedViewportEl: HTMLElement | undefined;
	private pendingAnchorStart: number | undefined;
	private programmaticScroll = false;
	private programmaticScrollClear = 0;
	private scrollbarDrag = false;
	private lastTouchY: number | undefined;
	private windowPaintQueued = false;
	private dragSlideTimer = 0;
	private dragSlideEdge: FeedWindowSlideEdge | undefined;
	private pendingDragSlide: FeedWindowSlideEdge | undefined;

	constructor() {
		this.layout$
			.pipe(debounceTime(0), takeUntilDestroyed(this.destroyRef))
			.subscribe(() => {
				this.ngZone.run(() => {
					this.flushLayout();
				});
			});
		this.slide$
			.pipe(
				auditTime(FEED_WINDOW_SLIDE_AUDIT_MS),
				takeUntilDestroyed(this.destroyRef),
			)
			.subscribe(() => {
				this.ngZone.run(() => {
					this.flushRecenter();
				});
			});
		this.feed.feedRows$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((rows) => {
				this.onRows(rows);
			});
		this.destroyRef.onDestroy(() => {
			this.layout$.complete();
			this.slide$.complete();
			this.stopDragSlide();
			this.clearProgrammaticScroll();
			this.resizeObserver?.disconnect();
		});
	}

	clearFeed(): void {
		this.bridge.raw['runner.executionFeed.clear.requested'].next({});
	}

	onWheel(event: WheelEvent): void {
		this.applyPinGesture(pinGestureFromWheelDelta(event.deltaY));
		this.requestRecenter();
	}

	onKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Home') {
			event.preventDefault();
			this.jumpToHead();
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			this.scrollToBottom();
			return;
		}

		this.applyPinGesture(pinGestureFromScrollKey(event.key));
		this.requestRecenter();
	}

	onTouchStart(event: TouchEvent): void {
		this.lastTouchY = event.touches[0]?.clientY;
	}

	onTouchMove(event: TouchEvent): void {
		const y = event.touches[0]?.clientY;
		if (this.lastTouchY === undefined || y === undefined) {
			return;
		}

		const deltaY = y - this.lastTouchY;
		this.lastTouchY = y;
		this.applyPinGesture(pinGestureFromTouchDelta(deltaY));
		this.requestRecenter();
	}

	onPointerDown(event: PointerEvent): void {
		const el = this.viewportRef()?.nativeElement;
		if (el === undefined) {
			return;
		}

		const rect = el.getBoundingClientRect();
		const scrollbarWidth = el.offsetWidth - el.clientWidth;
		if (isVerticalScrollbarHit(event.clientX, rect.right, scrollbarWidth)) {
			this.scrollbarDrag = true;
			el.setPointerCapture(event.pointerId);
			return;
		}

		el.focus({ preventScroll: true });
	}

	onPointerUp(): void {
		if (!this.scrollbarDrag) {
			return;
		}

		this.scrollbarDrag = false;
		this.stopDragSlide();
		this.applyPinFromGeometry();
		this.flushRecenter();
	}

	onScroll(): void {
		if (this.programmaticScroll) {
			this.clearProgrammaticScroll();
			return;
		}

		if (this.scrollbarDrag) {
			this.applyPinFromGeometry();
			this.syncDragSlide();
			return;
		}

		this.requestRecenter();
	}

	scrollToBottom(): void {
		this.pinnedToBottom.set(true);
		this.setWindow(
			nextWindowFromAnchor(
				this.rowIdList(this.rows()),
				this.rowHeights(),
				this.viewportPx(),
				'tail',
			),
		);
		this.scheduleLayout();
	}

	onDetailsOpenChange(event: {
		readonly key: string;
		readonly open: boolean;
	}): void {
		this.openKeys.update((prev) => {
			const next = new Set(prev);
			if (event.open) {
				next.add(event.key);
			} else {
				next.delete(event.key);
			}

			return next;
		});
		this.scheduleLayout();
	}

	private jumpToHead(): void {
		this.pinnedToBottom.set(false);
		this.setWindow(
			nextWindowFromAnchor(
				this.rowIdList(this.rows()),
				this.rowHeights(),
				this.viewportPx(),
				'head',
			),
		);
		const el = this.viewportRef()?.nativeElement;
		if (el !== undefined) {
			this.programmaticScroll = true;
			el.scrollTop = 0;
			this.queueClearProgrammaticScroll();
		}

		this.scheduleLayout();
	}

	private onRows(rows: readonly FeedRow[]): void {
		this.rows.set(rows);
		if (rows.length === 0) {
			this.resetWindow();
			return;
		}

		const ids = this.rowIdList(rows);
		const heights = this.rowHeights();
		const viewportPx = this.viewportPx();
		if (this.scrollbarDrag) {
			this.setWindow(retainFeedWindow(this.feedWindow(), rows.length));
		} else if (this.pinnedToBottom()) {
			this.setWindow(
				nextWindowFromAnchor(ids, heights, viewportPx, 'tail'),
			);
		} else {
			this.setWindow(retainFeedWindow(this.feedWindow(), rows.length));
		}

		this.scheduleLayout();
	}

	private resetWindow(): void {
		this.feedWindow.set(emptyFeedWindow());
		this.rowHeights.set(new Map());
		this.pendingAnchorStart = undefined;
		this.pendingDragSlide = undefined;
		this.stopDragSlide();
		this.pinnedToBottom.set(true);
		this.resizeObserver?.disconnect();
		this.resizeObserver = undefined;
		this.observedViewportEl = undefined;
	}

	private requestRecenter(): void {
		if (this.scrollbarDrag) {
			return;
		}

		this.slide$.next();
	}

	private syncDragSlide(): void {
		if (!this.scrollbarDrag) {
			this.stopDragSlide();
			return;
		}

		const el = this.viewportRef()?.nativeElement;
		if (el === undefined) {
			this.stopDragSlide();
			return;
		}

		const edge = feedWindowDragSlideEdge(
			this.feedWindow(),
			this.rows().length,
			el.scrollHeight,
			el.scrollTop,
			el.clientHeight,
		);
		if (edge === undefined) {
			this.stopDragSlide();
			return;
		}

		this.startDragSlide(edge);
	}

	private startDragSlide(edge: FeedWindowSlideEdge): void {
		if (this.dragSlideEdge === edge && this.dragSlideTimer !== 0) {
			return;
		}

		this.stopDragSlide();
		this.dragSlideEdge = edge;
		this.nibbleDragWindow(edge);
		this.ngZone.runOutsideAngular(() => {
			this.dragSlideTimer = window.setInterval(() => {
				this.ngZone.run(() => {
					const next = this.dragSlideEdge;
					if (next === undefined) {
						return;
					}

					this.nibbleDragWindow(next);
				});
			}, FEED_WINDOW_SLIDE_AUDIT_MS);
		});
	}

	private stopDragSlide(): void {
		if (this.dragSlideTimer !== 0) {
			clearInterval(this.dragSlideTimer);
			this.dragSlideTimer = 0;
		}

		this.dragSlideEdge = undefined;
	}

	private nibbleDragWindow(edge: FeedWindowSlideEdge): void {
		const window = this.feedWindow();
		const next = slideFeedWindowByOne(window, this.rows().length, edge);
		if (sameFeedWindow(window, next)) {
			this.stopDragSlide();
			return;
		}

		this.pendingDragSlide = edge;
		this.setWindow(next);
	}

	private flushRecenter(): void {
		if (this.scrollbarDrag) {
			return;
		}

		const el = this.viewportRef()?.nativeElement;
		const rows = this.rows();
		if (el === undefined || rows.length === 0) {
			return;
		}

		if (this.pinnedToBottom()) {
			return;
		}

		const ids = this.rowIdList(rows);
		const heights = this.rowHeights();
		const window = this.feedWindow();
		const visible = visibleFeedRange(
			window,
			ids,
			heights,
			el.scrollTop,
			el.clientHeight,
		);
		if (
			!shouldRecenterWindow(
				window,
				visible,
				ids,
				heights,
				el.clientHeight,
			)
		) {
			return;
		}

		const next = windowAroundVisible(
			visible.start,
			visible.end,
			ids,
			heights,
			el.clientHeight,
		);
		if (sameFeedWindow(window, next)) {
			return;
		}

		this.setWindow(next);
		this.scheduleLayout();
	}

	private flushLayout(): void {
		this.attachResizeObserver();
		this.measureRowHeights();
		if (this.scrollbarDrag) {
			return;
		}

		const rows = this.rows();
		if (rows.length === 0) {
			return;
		}

		const ids = this.rowIdList(rows);
		const heights = this.rowHeights();
		const viewportPx = this.viewportPx();
		const next = this.pinnedToBottom()
			? nextWindowFromAnchor(ids, heights, viewportPx, 'tail')
			: this.nextUnpinnedLayoutWindow(ids, heights, viewportPx);
		this.setWindow(next);
		this.queueAfterWindowPaint();
	}

	private queueAfterWindowPaint(): void {
		if (this.windowPaintQueued) {
			return;
		}

		this.windowPaintQueued = true;
		afterNextRender(
			() => {
				this.windowPaintQueued = false;
				const dragSlide = this.pendingDragSlide;
				this.pendingDragSlide = undefined;
				const el = this.viewportRef()?.nativeElement;
				if (dragSlide !== undefined && el !== undefined) {
					this.pendingAnchorStart = undefined;
					this.measureRowHeights();
					this.programmaticScroll = true;
					el.scrollTop = dragSlide === 'start' ? 0 : el.scrollHeight;
					this.queueClearProgrammaticScroll();
					return;
				}

				const rows = this.rows();
				this.measureRowHeights();
				this.applyPrependCorrection(this.rowIdList(rows));
				this.stickToBottomIfPinned();
			},
			{ injector: this.injector },
		);
	}

	private nextUnpinnedLayoutWindow(
		ids: readonly string[],
		heights: ReadonlyMap<string, number>,
		viewportPx: number,
	): FeedWindow {
		const current = retainFeedWindow(this.feedWindow(), ids.length);
		const el = this.viewportRef()?.nativeElement;
		const visible = visibleFeedRange(
			current,
			ids,
			heights,
			el?.scrollTop ?? 0,
			el?.clientHeight ?? viewportPx,
		);
		const around = windowAroundVisible(
			visible.start,
			visible.end,
			ids,
			heights,
			viewportPx,
		);
		if (
			shouldRecenterWindow(current, visible, ids, heights, viewportPx) ||
			(around.start >= current.start && around.end <= current.end)
		) {
			return around;
		}

		return current;
	}

	private measureRowHeights(): void {
		const list = this.listRef()?.nativeElement;
		const slice = this.visibleRows();
		if (list === undefined || slice.length === 0) {
			return;
		}

		const next = new Map(this.rowHeights());
		let changed = false;
		for (let i = 0; i < slice.length; i++) {
			const child = list.children[i];
			if (!(child instanceof HTMLElement)) {
				continue;
			}

			const rowId = slice[i]?.rowId;
			if (rowId === undefined) {
				continue;
			}

			const height = child.offsetHeight;
			if (next.get(rowId) !== height) {
				next.set(rowId, height);
				changed = true;
			}
		}

		if (changed) {
			this.rowHeights.set(next);
		}
	}

	private applyPrependCorrection(rowIds: readonly string[]): void {
		const anchor = this.pendingAnchorStart;
		const el = this.viewportRef()?.nativeElement;
		this.pendingAnchorStart = undefined;
		if (anchor === undefined || el === undefined) {
			return;
		}

		const start = this.feedWindow().start;
		if (start >= anchor) {
			return;
		}

		const delta = sumRowHeights(rowIds, start, anchor, this.rowHeights());
		if (delta <= 0) {
			return;
		}

		this.programmaticScroll = true;
		el.scrollTop += delta;
		this.queueClearProgrammaticScroll();
	}

	private setWindow(next: FeedWindow): void {
		const prev = this.feedWindow();
		if (sameFeedWindow(prev, next)) {
			return;
		}

		if (next.start < prev.start) {
			this.pendingAnchorStart = prev.start;
		}

		this.feedWindow.set(next);
		this.queueAfterWindowPaint();
	}

	private attachResizeObserver(): void {
		const el = this.viewportRef()?.nativeElement;
		const list = this.listRef()?.nativeElement;
		if (el === undefined || list === undefined) {
			return;
		}

		if (
			this.observedViewportEl === el &&
			this.resizeObserver !== undefined
		) {
			return;
		}

		this.resizeObserver?.disconnect();
		this.observedViewportEl = el;
		this.resizeObserver = new ResizeObserver(() => {
			this.scheduleLayout();
		});
		this.resizeObserver.observe(el);
		this.resizeObserver.observe(list);
	}

	private scheduleLayout(): void {
		this.layout$.next();
	}

	private applyPinGesture(gesture: FeedPinGesture): void {
		if (gesture === 'unpin') {
			this.pinnedToBottom.set(false);
			return;
		}

		if (gesture === 'maybe-repin') {
			this.queueRepinIfAtBottom();
		}
	}

	private queueRepinIfAtBottom(): void {
		requestAnimationFrame(() => {
			this.applyPinFromGeometry();
			if (this.pinnedToBottom()) {
				this.stickToBottomIfPinned();
			}
		});
	}

	private applyPinFromGeometry(): void {
		const el = this.viewportRef()?.nativeElement;
		if (el === undefined) {
			return;
		}

		this.pinnedToBottom.set(
			isFeedPinnedToTail(
				this.feedWindow(),
				this.rows().length,
				el.scrollHeight,
				el.scrollTop,
				el.clientHeight,
			),
		);
	}

	private stickToBottomIfPinned(): void {
		if (!this.pinnedToBottom()) {
			return;
		}

		const el = this.viewportRef()?.nativeElement;
		const rows = this.rows();
		if (el === undefined || this.feedWindow().end !== rows.length) {
			return;
		}

		this.programmaticScroll = true;
		el.scrollTop = el.scrollHeight;
		this.queueClearProgrammaticScroll();
	}

	private queueClearProgrammaticScroll(): void {
		if (this.programmaticScrollClear !== 0) {
			cancelAnimationFrame(this.programmaticScrollClear);
		}

		this.programmaticScrollClear = requestAnimationFrame(() => {
			this.programmaticScrollClear = 0;
			this.programmaticScroll = false;
		});
	}

	private clearProgrammaticScroll(): void {
		this.programmaticScroll = false;
		if (this.programmaticScrollClear === 0) {
			return;
		}

		cancelAnimationFrame(this.programmaticScrollClear);
		this.programmaticScrollClear = 0;
	}

	private viewportPx(): number {
		return this.viewportRef()?.nativeElement.clientHeight ?? 0;
	}

	private rowIdList(rows: readonly FeedRow[]): readonly string[] {
		return rows.map((row) => row.rowId);
	}
}
