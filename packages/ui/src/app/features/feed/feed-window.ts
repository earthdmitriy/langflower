import { isPinnedToBottom, isPinnedToTop } from './is-pinned-to-bottom.js';

export const FEED_WINDOW_PAD_VIEWPORTS = 10;
const FEED_WINDOW_RECENTER_VIEWPORTS = 2;
export const FEED_WINDOW_MAX_ROWS_PER_SIDE = 400;
export const FEED_WINDOW_UNMEASURED_PX = 24;
export const FEED_WINDOW_SLIDE_AUDIT_MS = 48;

export type FeedWindow = {
	readonly start: number;
	readonly end: number;
};

export type FeedWindowSlideEdge = 'start' | 'end';

export const emptyFeedWindow = (): FeedWindow => ({ start: 0, end: 0 });

export const sameFeedWindow = (a: FeedWindow, b: FeedWindow): boolean =>
	a.start === b.start && a.end === b.end;

export const feedWindowShowsHead = (window: FeedWindow): boolean =>
	window.start === 0;

export const feedWindowShowsTail = (
	window: FeedWindow,
	length: number,
): boolean => length > 0 && window.end === length;

export const clampFeedWindow = (
	window: FeedWindow,
	length: number,
): FeedWindow => {
	if (length <= 0) {
		return emptyFeedWindow();
	}

	const start = Math.max(0, Math.min(window.start, length));
	const end = Math.max(start, Math.min(window.end, length));
	return { start, end };
};

export const retainFeedWindow = (
	window: FeedWindow,
	length: number,
): FeedWindow => clampFeedWindow(window, length);

export const formatFeedWindowProgress = (
	window: FeedWindow,
	length: number,
	edge: FeedWindowSlideEdge,
): string => {
	if (length <= 0) {
		return 'rendering 0 of 0 items';
	}

	const current = clampFeedWindow(window, length);
	const n = edge === 'start' ? current.start + 1 : current.end;
	return `rendering ${n} of ${length} items`;
};

export const sliceFeedWindow = <T>(
	rows: readonly T[],
	window: FeedWindow,
): readonly T[] => rows.slice(window.start, window.end);

export const sumRowHeights = (
	rowIds: readonly string[],
	start: number,
	end: number,
	heights: ReadonlyMap<string, number>,
): number => {
	const from = Math.max(0, start);
	const to = Math.min(rowIds.length, end);
	let sum = 0;
	for (let i = from; i < to; i++) {
		sum += heights.get(rowIds[i] ?? '') ?? 0;
	}

	return sum;
};

export const isFeedPinnedToTail = (
	window: FeedWindow,
	length: number,
	scrollHeight: number,
	scrollTop: number,
	clientHeight: number,
	thresholdPx?: number,
): boolean =>
	feedWindowShowsTail(window, length) &&
	isPinnedToBottom(scrollHeight, scrollTop, clientHeight, thresholdPx);

export const slideFeedWindowByOne = (
	window: FeedWindow,
	length: number,
	edge: FeedWindowSlideEdge,
): FeedWindow => {
	const current = clampFeedWindow(window, length);
	if (current.start === current.end) {
		return current;
	}

	if (edge === 'start') {
		if (current.start <= 0) {
			return current;
		}

		return { start: current.start - 1, end: current.end - 1 };
	}

	if (current.end >= length) {
		return current;
	}

	return { start: current.start + 1, end: current.end + 1 };
};

export const feedWindowDragSlideEdge = (
	window: FeedWindow,
	length: number,
	scrollHeight: number,
	scrollTop: number,
	clientHeight: number,
): FeedWindowSlideEdge | undefined => {
	if (length <= 0) {
		return undefined;
	}

	const current = clampFeedWindow(window, length);
	const atStart = isPinnedToTop(scrollTop) && current.start > 0;
	const atEnd =
		isPinnedToBottom(scrollHeight, scrollTop, clientHeight) &&
		current.end < length;
	if (atStart && !atEnd) {
		return 'start';
	}

	if (atEnd && !atStart) {
		return 'end';
	}

	return undefined;
};

export const visibleFeedRange = (
	window: FeedWindow,
	rowIds: readonly string[],
	heights: ReadonlyMap<string, number>,
	scrollTop: number,
	clientHeight: number,
): FeedWindow => {
	const current = clampFeedWindow(window, rowIds.length);
	if (current.start === current.end) {
		return current;
	}

	const viewTop = Math.max(0, scrollTop);
	const viewBottom = viewTop + Math.max(clientHeight, 1);
	let y = 0;
	let visStart: number | undefined;
	let visEnd = current.start;
	for (let i = current.start; i < current.end; i++) {
		const h = heightAt(rowIds, heights, i);
		const top = y;
		const bottom = y + h;
		if (bottom > viewTop && top < viewBottom) {
			if (visStart === undefined) {
				visStart = i;
			}

			visEnd = i + 1;
		} else if (visStart !== undefined && top >= viewBottom) {
			break;
		}

		y += h;
	}

	if (visStart === undefined) {
		return rowAtOffset(current, rowIds, heights, viewTop);
	}

	return { start: visStart, end: visEnd };
};

export const windowAroundVisible = (
	visibleStart: number,
	visibleEnd: number,
	rowIds: readonly string[],
	heights: ReadonlyMap<string, number>,
	viewportPx: number,
): FeedWindow => {
	const length = rowIds.length;
	if (length <= 0) {
		return emptyFeedWindow();
	}

	const visible = clampVisibleRange(visibleStart, visibleEnd, length);
	const pad = padPx(viewportPx);
	return {
		start: walkBackward(visible.start, rowIds, heights, pad),
		end: walkForward(visible.end, rowIds, heights, pad),
	};
};

export const shouldRecenterWindow = (
	window: FeedWindow,
	visible: FeedWindow,
	rowIds: readonly string[],
	heights: ReadonlyMap<string, number>,
	viewportPx: number,
): boolean => {
	const length = rowIds.length;
	const current = clampFeedWindow(window, length);
	const vis = clampFeedWindow(visible, length);
	if (length <= 0 || vis.start === vis.end) {
		return false;
	}

	const threshold = recenterPx(viewportPx);
	const padAbove = sumPlaceholderHeights(
		rowIds,
		current.start,
		vis.start,
		heights,
	);
	const padBelow = sumPlaceholderHeights(
		rowIds,
		vis.end,
		current.end,
		heights,
	);
	const needsAbove = current.start > 0 && padAbove < threshold;
	const needsBelow = current.end < length && padBelow < threshold;
	return needsAbove || needsBelow;
};

export const nextWindowFromAnchor = (
	rowIds: readonly string[],
	heights: ReadonlyMap<string, number>,
	viewportPx: number,
	anchor: 'head' | 'tail',
): FeedWindow => {
	const length = rowIds.length;
	if (length <= 0) {
		return emptyFeedWindow();
	}

	const screen = screenPx(viewportPx);
	if (anchor === 'head') {
		return windowAroundVisible(
			0,
			walkForward(0, rowIds, heights, screen),
			rowIds,
			heights,
			viewportPx,
		);
	}

	return windowAroundVisible(
		walkBackward(length, rowIds, heights, screen),
		length,
		rowIds,
		heights,
		viewportPx,
	);
};

const padPx = (viewportPx: number): number =>
	viewportPx > 0
		? viewportPx * FEED_WINDOW_PAD_VIEWPORTS
		: Number.POSITIVE_INFINITY;

const screenPx = (viewportPx: number): number =>
	viewportPx > 0 ? viewportPx : Number.POSITIVE_INFINITY;

const recenterPx = (viewportPx: number): number =>
	viewportPx > 0 ? viewportPx * FEED_WINDOW_RECENTER_VIEWPORTS : 0;

const heightAt = (
	rowIds: readonly string[],
	heights: ReadonlyMap<string, number>,
	index: number,
): number => {
	const measured = heights.get(rowIds[index] ?? '');
	return measured !== undefined && measured > 0
		? measured
		: FEED_WINDOW_UNMEASURED_PX;
};

const sumPlaceholderHeights = (
	rowIds: readonly string[],
	start: number,
	end: number,
	heights: ReadonlyMap<string, number>,
): number => {
	const from = Math.max(0, start);
	const to = Math.min(rowIds.length, end);
	let sum = 0;
	for (let i = from; i < to; i++) {
		sum += heightAt(rowIds, heights, i);
	}

	return sum;
};

const clampVisibleRange = (
	visibleStart: number,
	visibleEnd: number,
	length: number,
): FeedWindow => {
	const start = Math.max(0, Math.min(visibleStart, length));
	const end = Math.max(start, Math.min(visibleEnd, length));
	if (end > start) {
		return { start, end };
	}

	if (start < length) {
		return { start, end: start + 1 };
	}

	return { start: length - 1, end: length };
};

const rowAtOffset = (
	window: FeedWindow,
	rowIds: readonly string[],
	heights: ReadonlyMap<string, number>,
	offsetPx: number,
): FeedWindow => {
	let y = 0;
	for (let i = window.start; i < window.end; i++) {
		const next = y + heightAt(rowIds, heights, i);
		if (offsetPx < next || i === window.end - 1) {
			return { start: i, end: i + 1 };
		}

		y = next;
	}

	return { start: window.start, end: Math.min(window.start + 1, window.end) };
};

const walkForward = (
	start: number,
	rowIds: readonly string[],
	heights: ReadonlyMap<string, number>,
	capPx: number,
): number => {
	const length = rowIds.length;
	let end = Math.max(0, Math.min(start, length));
	let sum = 0;
	let count = 0;
	while (end < length && count < FEED_WINDOW_MAX_ROWS_PER_SIDE) {
		if (count > 0 && sum >= capPx) {
			break;
		}

		sum += heightAt(rowIds, heights, end);
		end += 1;
		count += 1;
	}

	return end;
};

const walkBackward = (
	endExclusive: number,
	rowIds: readonly string[],
	heights: ReadonlyMap<string, number>,
	capPx: number,
): number => {
	const length = rowIds.length;
	let start = Math.max(0, Math.min(endExclusive, length));
	let sum = 0;
	let count = 0;
	while (start > 0 && count < FEED_WINDOW_MAX_ROWS_PER_SIDE) {
		if (count > 0 && sum >= capPx) {
			break;
		}

		start -= 1;
		sum += heightAt(rowIds, heights, start);
		count += 1;
	}

	return start;
};
