import type { RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { flattenFeedRows } from '../operators/feed-folding-operators';
import {
	appendFeedFrame,
	emptyFeedProjection,
} from '../operators/feed-projection';
import type { FeedEventFromSource, FeedItemRow, PortFrameMeta } from '../types';

const run = 'run-1' as RunId;

const event = (
	value: unknown,
	meta: PortFrameMeta,
	portId: string,
	nodeId = 'preview',
): FeedEventFromSource => ({
	source: 'port',
	kind: 'output-emitted',
	runId: run,
	nodeId,
	portId,
	state: 'value',
	value,
	meta,
});

describe('flattenFeedRows', () => {
	it('emits a header plus one row per result bubble in a single visit', () => {
		let state = emptyFeedProjection();
		state = appendFeedFrame(
			state,
			event('one', { presentation: 'result' }, 'text'),
		);
		state = appendFeedFrame(
			state,
			event('two', { presentation: 'result' }, 'text'),
		);
		state = appendFeedFrame(
			state,
			event('three', { presentation: 'result' }, 'text'),
		);

		const rows = flattenFeedRows(state);
		expect(rows.map((row) => row.kind)).toEqual([
			'header',
			'item',
			'item',
			'item',
		]);
		expect(rows[0]).toMatchObject({
			kind: 'header',
			nodeId: 'preview',
			rowId: `h:${state.visits[0]!.visitId}`,
		});
		const items = rows.slice(1) as FeedItemRow[];
		expect(items.map((row) => row.item.value)).toEqual([
			'one',
			'two',
			'three',
		]);
		expect(items.every((row) => row.isLastSegment)).toBe(true);
		expect(items[2]?.isLastInVisit).toBe(true);
		expect(items[0]?.isLastInVisit).toBe(false);
	});

	it('omits the last draft segment when a result is present', () => {
		let state = emptyFeedProjection();
		state = appendFeedFrame(
			state,
			event('think', { presentation: 'draft' }, 'draft', 'agent'),
		);
		state = appendFeedFrame(
			state,
			event('hello', { presentation: 'result' }, 'result', 'agent'),
		);

		const rows = flattenFeedRows(state);
		expect(rows.map((row) => row.kind)).toEqual(['header', 'item']);
		expect((rows[1] as FeedItemRow).item.value).toBe('hello');
	});

	it('keeps earlier drafts when a later result lands', () => {
		let state = emptyFeedProjection();
		state = appendFeedFrame(
			state,
			event('d1', { presentation: 'draft' }, 'draft', 'agent'),
		);
		state = appendFeedFrame(
			state,
			event('t1', { presentation: 'tool' }, 'tool', 'agent'),
		);
		state = appendFeedFrame(
			state,
			event('d2', { presentation: 'draft' }, 'draft', 'agent'),
		);
		state = appendFeedFrame(
			state,
			event('ok', { presentation: 'result' }, 'result', 'agent'),
		);

		const rows = flattenFeedRows(state);
		const values = rows
			.filter((row): row is FeedItemRow => row.kind === 'item')
			.map((row) => row.item.value);
		expect(values).toEqual(['d1', 't1', 'ok']);
	});

	it('marks only the last visible segment as last', () => {
		let state = emptyFeedProjection();
		state = appendFeedFrame(
			state,
			event('r1', { presentation: 'reasoning' }, 'reasoning', 'agent'),
		);
		state = appendFeedFrame(
			state,
			event('d1', { presentation: 'draft' }, 'draft', 'agent'),
		);

		const rows = flattenFeedRows(state);
		const items = rows.filter(
			(row): row is FeedItemRow => row.kind === 'item',
		);
		expect(items).toHaveLength(2);
		expect(items[0]?.isLastSegment).toBe(false);
		expect(items[1]?.isLastSegment).toBe(true);
	});

	it('marks only the first visit header as first', () => {
		let state = emptyFeedProjection();
		state = appendFeedFrame(
			state,
			event('ones', { presentation: 'result' }, 'text', 'preview'),
		);
		state = appendFeedFrame(
			state,
			event('done', { presentation: 'result' }, 'text', 'finish'),
		);

		const headers = flattenFeedRows(state).filter(
			(row) => row.kind === 'header',
		);
		expect(headers).toHaveLength(2);
		expect(headers[0]).toMatchObject({
			nodeId: 'preview',
			isFirstVisit: true,
		});
		expect(headers[1]).toMatchObject({
			nodeId: 'finish',
			isFirstVisit: false,
		});
	});
});
