import type { RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import {
	appendFeedFrame,
	emptyFeedProjection,
	portItemsKey,
	replayFeedProjection,
	type FeedProjection,
} from '../operators/feed-projection';
import type { FeedEventFromSource, PortFrameMeta } from '../types';
import {
	createExecutionFeedHarness,
	outputEvent,
	paletteDefinition,
	readItems,
	runId,
} from './execution-feed.service.fixture';

const run = 'run-1' as RunId;

const event = (
	value: unknown,
	meta: PortFrameMeta,
	portId = 'draft',
	nodeId = 'agent',
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

const agent = paletteDefinition('agent', [
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
]);

describe('appendFeedFrame (incremental projection)', () => {
	it('appends into pre-computed port items without rescanning prior frames', () => {
		const afterFirst = appendFeedFrame(
			emptyFeedProjection(),
			event('A', { presentation: 'draft' }),
		);
		const afterSecond = appendFeedFrame(
			afterFirst,
			event('B', { presentation: 'draft' }),
		);

		const segmentId = afterFirst.portsByVisit.get(
			afterFirst.visits[0]!.visitId,
		)?.[0]?.segmentId;
		const key = portItemsKey(segmentId!);
		expect(
			afterFirst.itemsByPort.get(key)?.map((item) => item.value),
		).toEqual(['A']);
		expect(
			afterSecond.itemsByPort.get(key)?.map((item) => item.value),
		).toEqual(['AB']);
		expect(afterSecond.nextSeq).toBe(2);
		expect(afterSecond.visits).toHaveLength(1);
	});

	it('opens a new segment when a portId re-enters after another port', () => {
		let state = emptyFeedProjection();
		for (const frame of [
			event('r1', { presentation: 'reasoning' }, 'reasoning'),
			event('d1', { presentation: 'draft' }, 'draft'),
			event('t1', { presentation: 'tool' }, 'tool'),
			event('r2', { presentation: 'reasoning' }, 'reasoning'),
		]) {
			state = appendFeedFrame(state, frame);
		}

		const visitId = state.visits[0]!.visitId;
		const segments = state.portsByVisit.get(visitId) ?? [];
		expect(segments.map((segment) => segment.portId)).toEqual([
			'reasoning',
			'draft',
			'tool',
			'reasoning',
		]);
		expect(segments[0]!.segmentId).not.toBe(segments[3]!.segmentId);
		expect(
			state.itemsByPort
				.get(portItemsKey(segments[0]!.segmentId))
				?.map((item) => item.value),
		).toEqual(['r1']);
		expect(
			state.itemsByPort
				.get(portItemsKey(segments[3]!.segmentId))
				?.map((item) => item.value),
		).toEqual(['r2']);
	});

	it('matches snapshot replay of the same event sequence', () => {
		const events = [
			event('A', { presentation: 'draft' }, 'draft', 'a'),
			event('B', { presentation: 'draft' }, 'draft', 'b'),
			event('1', { presentation: 'draft' }, 'draft', 'a'),
			event('2', { presentation: 'draft' }, 'draft', 'b'),
		];

		let live: FeedProjection = emptyFeedProjection();
		for (const frame of events) {
			live = appendFeedFrame(live, frame);
		}
		const replayed = replayFeedProjection(events);

		expect(live.visits.map((visit) => visit.nodeId)).toEqual(
			replayed.visits.map((visit) => visit.nodeId),
		);
		const aSeg = live.portsByVisit.get(live.visits[0]!.visitId)![0]!;
		const bSeg = live.portsByVisit.get(live.visits[1]!.visitId)![0]!;
		expect(
			live.itemsByPort.get(portItemsKey(aSeg.segmentId))?.[0]?.value,
		).toBe('A1');
		expect(
			replayed.itemsByPort.get(portItemsKey(aSeg.segmentId))?.[0]?.value,
		).toBe('A1');
		expect(
			live.itemsByPort.get(portItemsKey(bSeg.segmentId))?.[0]?.value,
		).toBe('B2');
	});
});

describe('ExecutionFeedService incremental projection', () => {
	it('live appends match a later snapshot of the same events', async () => {
		const events = [
			outputEvent('agent', 'draft', 'X'),
			outputEvent('agent', 'draft', 'Y'),
			outputEvent('agent', 'draft', 'Z'),
		];

		const live = createExecutionFeedHarness();
		live.seedCatalog({ agent: 'agent' }, [agent]);
		for (const frame of events) {
			live.raw.runnerPort$.next(frame);
		}

		const snapshot = createExecutionFeedHarness();
		snapshot.seedCatalog({ agent: 'agent' }, [agent]);
		snapshot.raw.executionFeedSnapshot$.next({
			runId: runId(),
			workflowId: 'wf-1',
			status: 'running',
			events,
		});

		expect(
			(await readItems(live.latestNodes()[0]!, 'draft')).map(
				(item) => item.value,
			),
		).toEqual(['XYZ']);
		expect(
			(await readItems(snapshot.latestNodes()[0]!, 'draft')).map(
				(item) => item.value,
			),
		).toEqual(['XYZ']);
	});
});
