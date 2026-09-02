import { describe, expect, it } from 'vitest';
import {
	FEED_WINDOW_MAX_ROWS_PER_SIDE,
	FEED_WINDOW_PAD_VIEWPORTS,
	FEED_WINDOW_UNMEASURED_PX,
	clampFeedWindow,
	feedWindowDragSlideEdge,
	feedWindowShowsHead,
	feedWindowShowsTail,
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
} from '../feed-window';

const ids = (count: number): readonly string[] =>
	Array.from({ length: count }, (_, i) => `r${i}`);

const heightMap = (
	rowIds: readonly string[],
	px: number,
): ReadonlyMap<string, number> => new Map(rowIds.map((id) => [id, px]));

const emptyHeights = (): ReadonlyMap<string, number> => new Map();

const padRowCount = (viewportPx: number, rowPx: number): number =>
	Math.ceil((viewportPx * FEED_WINDOW_PAD_VIEWPORTS) / rowPx);

describe('clampFeedWindow', () => {
	it('returns empty when there are no rows', () => {
		expect(clampFeedWindow({ start: 3, end: 8 }, 0)).toEqual({
			start: 0,
			end: 0,
		});
	});

	it('clips to length', () => {
		expect(clampFeedWindow({ start: 2, end: 20 }, 10)).toEqual({
			start: 2,
			end: 10,
		});
	});
});

describe('windowAroundVisible', () => {
	it('pads about 10 viewports on each side of small rows', () => {
		const rowIds = ids(1000);
		const heights = heightMap(rowIds, 40);
		const window = windowAroundVisible(500, 510, rowIds, heights, 400);

		expect(window.start).toBe(400);
		expect(window.end).toBe(610);
		expect(feedWindowShowsHead(window)).toBe(false);
		expect(feedWindowShowsTail(window, 1000)).toBe(false);
	});

	it('keeps neighbors of a 5000px row, not only the giant', () => {
		const rowIds = ids(40);
		const heights = new Map(
			rowIds.map((id, i) => [id, i === 20 ? 5000 : 40]),
		);
		const window = windowAroundVisible(20, 21, rowIds, heights, 400);

		expect(window.start).toBeLessThan(20);
		expect(window.end).toBeGreaterThan(21);
		expect(window.start).toBe(0);
		expect(window.end).toBe(40);
	});

	it('caps unmeasured rows per side', () => {
		const rowIds = ids(2000);
		const window = windowAroundVisible(
			1000,
			1001,
			rowIds,
			emptyHeights(),
			400,
		);
		const padRows = padRowCount(400, FEED_WINDOW_UNMEASURED_PX);

		expect(window.start).toBe(1000 - padRows);
		expect(window.end).toBe(1001 + padRows);
		expect(window.end - window.start).toBeLessThanOrEqual(
			1 + 2 * FEED_WINDOW_MAX_ROWS_PER_SIDE,
		);
	});
});

describe('visibleFeedRange', () => {
	it('returns rows that intersect the viewport', () => {
		const rowIds = ids(20);
		const heights = heightMap(rowIds, 100);
		const visible = visibleFeedRange(
			{ start: 0, end: 20 },
			rowIds,
			heights,
			350,
			400,
		);

		expect(visible).toEqual({ start: 3, end: 8 });
	});

	it('keeps a tall row that fills the viewport', () => {
		const rowIds = ids(5);
		const heights = new Map([
			['r0', 40],
			['r1', 40],
			['r2', 5000],
			['r3', 24],
			['r4', 24],
		]);
		const visible = visibleFeedRange(
			{ start: 0, end: 5 },
			rowIds,
			heights,
			200,
			400,
		);

		expect(visible).toEqual({ start: 2, end: 3 });
	});
});

describe('nextWindowFromAnchor', () => {
	it('pins with end at length and pad only above', () => {
		const rowIds = ids(1000);
		const heights = heightMap(rowIds, 40);
		const window = nextWindowFromAnchor(rowIds, heights, 400, 'tail');

		expect(window.end).toBe(1000);
		expect(feedWindowShowsTail(window, 1000)).toBe(true);
		expect(window.start).toBe(890);
	});

	it('opens from the head with pad only below', () => {
		const rowIds = ids(1000);
		const heights = heightMap(rowIds, 40);
		const window = nextWindowFromAnchor(rowIds, heights, 400, 'head');

		expect(feedWindowShowsHead(window)).toBe(true);
		expect(window.start).toBe(0);
		expect(window.end).toBe(110);
	});

	it('includes the overflowing tail row and smaller neighbors above', () => {
		const rowIds = ids(5);
		const heights = new Map([
			['r0', 40],
			['r1', 40],
			['r2', 5000],
			['r3', 24],
			['r4', 24],
		]);
		const window = nextWindowFromAnchor(rowIds, heights, 400, 'tail');

		expect(window.end).toBe(5);
		expect(window.start).toBe(0);
	});
});

describe('shouldRecenterWindow', () => {
	it('recenters when the pad on one side is thinner than two viewports', () => {
		const rowIds = ids(100);
		const heights = heightMap(rowIds, 40);
		expect(
			shouldRecenterWindow(
				{ start: 40, end: 60 },
				{ start: 41, end: 50 },
				rowIds,
				heights,
				400,
			),
		).toBe(true);
	});

	it('does not recenter while the pad is still thick', () => {
		const rowIds = ids(1000);
		const heights = heightMap(rowIds, 40);
		expect(
			shouldRecenterWindow(
				{ start: 400, end: 610 },
				{ start: 500, end: 510 },
				rowIds,
				heights,
				400,
			),
		).toBe(false);
	});

	it('does not recenter while scrolling through a tall row with a thick pad', () => {
		const rowIds = ids(1000);
		const heights = new Map(
			rowIds.map((id, i) => [id, i === 500 ? 5000 : 40]),
		);
		const window = windowAroundVisible(500, 501, rowIds, heights, 400);
		const padAbove = sumRowHeights(rowIds, window.start, 500, heights);
		const visible = visibleFeedRange(
			window,
			rowIds,
			heights,
			padAbove + 80,
			400,
		);

		expect(visible).toEqual({ start: 500, end: 501 });
		expect(
			shouldRecenterWindow(window, visible, rowIds, heights, 400),
		).toBe(false);
	});

	it('recenters when a tall row has no older pad and older rows exist', () => {
		const rowIds = ids(5);
		const heights = new Map([
			['r0', 40],
			['r1', 40],
			['r2', 5000],
			['r3', 24],
			['r4', 24],
		]);
		expect(
			shouldRecenterWindow(
				{ start: 2, end: 5 },
				{ start: 2, end: 3 },
				rowIds,
				heights,
				400,
			),
		).toBe(true);
	});
});

describe('slideFeedWindowByOne', () => {
	it('shifts one row toward older and drops the newest', () => {
		expect(
			slideFeedWindowByOne({ start: 10, end: 20 }, 40, 'start'),
		).toEqual({ start: 9, end: 19 });
	});

	it('does not slide past the head', () => {
		expect(
			slideFeedWindowByOne({ start: 0, end: 10 }, 40, 'start'),
		).toEqual({ start: 0, end: 10 });
	});

	it('shifts one row toward newer and drops the oldest', () => {
		expect(slideFeedWindowByOne({ start: 10, end: 20 }, 40, 'end')).toEqual(
			{ start: 11, end: 21 },
		);
	});

	it('does not slide past the tail', () => {
		expect(slideFeedWindowByOne({ start: 30, end: 40 }, 40, 'end')).toEqual(
			{ start: 30, end: 40 },
		);
	});
});

describe('feedWindowDragSlideEdge', () => {
	it('slides start when the thumb is at the top of a mid-list window', () => {
		expect(
			feedWindowDragSlideEdge({ start: 10, end: 20 }, 40, 800, 0, 400),
		).toBe('start');
	});

	it('slides end when the thumb is at the bottom of a mid-list window', () => {
		expect(
			feedWindowDragSlideEdge({ start: 10, end: 20 }, 40, 800, 400, 400),
		).toBe('end');
	});

	it('does not slide at the real head or tail', () => {
		expect(
			feedWindowDragSlideEdge({ start: 0, end: 20 }, 40, 800, 0, 400),
		).toBeUndefined();
		expect(
			feedWindowDragSlideEdge({ start: 20, end: 40 }, 40, 800, 400, 400),
		).toBeUndefined();
	});
});

describe('isFeedPinnedToTail', () => {
	it('requires both the tail window and geometry at the bottom', () => {
		expect(
			isFeedPinnedToTail({ start: 10, end: 20 }, 20, 800, 400, 400),
		).toBe(true);
		expect(
			isFeedPinnedToTail({ start: 10, end: 20 }, 40, 800, 400, 400),
		).toBe(false);
		expect(
			isFeedPinnedToTail({ start: 10, end: 20 }, 20, 800, 0, 400),
		).toBe(false);
	});
});

describe('formatFeedWindowProgress', () => {
	it('shows the first index at the older edge and the last at the newer', () => {
		expect(
			formatFeedWindowProgress({ start: 10, end: 20 }, 40, 'start'),
		).toBe('rendering 11 of 40 items');
		expect(
			formatFeedWindowProgress({ start: 10, end: 20 }, 40, 'end'),
		).toBe('rendering 20 of 40 items');
	});

	it('ticks when the window slides by one', () => {
		const before = { start: 10, end: 20 };
		const after = slideFeedWindowByOne(before, 40, 'start');
		expect(formatFeedWindowProgress(after, 40, 'start')).toBe(
			'rendering 10 of 40 items',
		);
	});
});

describe('retainFeedWindow', () => {
	it('does not follow new tail rows', () => {
		expect(retainFeedWindow({ start: 10, end: 20 }, 50)).toEqual({
			start: 10,
			end: 20,
		});
	});
});

describe('slice and sum helpers', () => {
	it('slices rows and sums measured heights', () => {
		const rowIds = ids(5);
		const rows = rowIds.map((rowId) => ({ rowId }));
		expect(sliceFeedWindow(rows, { start: 1, end: 3 })).toEqual([
			{ rowId: 'r1' },
			{ rowId: 'r2' },
		]);
		expect(sumRowHeights(rowIds, 1, 3, heightMap(rowIds, 10))).toBe(20);
		expect(sameFeedWindow({ start: 1, end: 2 }, { start: 1, end: 2 })).toBe(
			true,
		);
	});
});
