import { foldFeedLogEvent } from '@langflower/runtime';
import type { EdgeId, RuntimeRunnerEvent } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';
import type { FeedCatalog } from '../../../services/execution-catalog';
import { replayNodeHitlFromSnapshot } from '../../canvas-node-status-folding/operators/canvas-node-hitl-projection';
import { replayNodeChromeFromSnapshot } from '../../canvas-node-status-folding/operators/canvas-node-status-projection';
import type { NodeFeedItem } from '../types';
import {
	createExecutionFeedHarness,
	inputEvent,
	outputEvent,
	paletteDefinition,
	runId,
} from './execution-feed.service.fixture';

const edge = (value: string): EdgeId => value as EdgeId;

const agent = paletteDefinition('agent', [
	{
		portId: 'reasoning',
		direction: 'out',
		role: 'reasoning',
		streaming: true,
	},
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
	{
		portId: 'progress',
		direction: 'out',
		role: 'progress',
		streaming: true,
	},
	{ portId: 'shell', direction: 'out', role: 'shell', streaming: true },
	{ portId: 'tool', direction: 'out', role: 'tool', streaming: true },
	{ portId: 'result', direction: 'out', role: 'result' },
	{
		portId: 'recovery',
		direction: 'out',
		role: 'recovery',
		streaming: true,
	},
	{ portId: 'prompt', direction: 'in' },
	{ portId: 'reply', direction: 'in', hitl: true },
]);

const sink = paletteDefinition('sink', [
	{
		portId: 'value',
		direction: 'in',
		role: 'draft',
		streaming: true,
	},
]);

const catalog: FeedCatalog = {
	labels: new Map([
		['agent', 'agent'],
		['sink', 'sink'],
	]),
	paletteByType: new Map([
		['agent', agent],
		['sink', sink],
	]),
	nodeTypeById: new Map([
		['agent', 'agent'],
		['sink', 'sink'],
	]),
	workflowId: 'wf-1',
};

const foldLog = (
	events: readonly RuntimeRunnerEvent[],
): readonly RuntimeRunnerEvent[] => {
	const log: RuntimeRunnerEvent[] = [];
	for (const event of events) {
		const step = foldFeedLogEvent(log[log.length - 1], event);
		if (step.kind === 'merge') {
			log[log.length - 1] = step.frame;
		} else {
			log.push(event);
		}
	}
	return log;
};

const snapshotFor = (
	events: readonly RuntimeRunnerEvent[],
): ExecutionFeedSnapshotPayload => ({
	runId: runId(),
	workflowId: 'wf-1',
	status: 'completed',
	events,
});

const projectFeed = async (
	events: readonly RuntimeRunnerEvent[],
): Promise<
	readonly {
		readonly nodeId: string;
		readonly isClosed: boolean;
		readonly hasResult: boolean;
		readonly segments: readonly {
			readonly portId: string;
			readonly items: readonly {
				readonly source: string;
				readonly state: string;
				readonly value: unknown;
				readonly meta: unknown;
			}[];
		}[];
	}[]
> => {
	const harness = createExecutionFeedHarness();
	harness.seedCatalog({ agent: 'agent', sink: 'sink' }, [agent, sink], {
		startRun: false,
	});
	harness.raw.executionFeedSnapshot$.next(snapshotFor(events));

	const visits = [];
	for (const visit of harness.latestNodes()) {
		visits.push(await readVisit(visit));
	}
	return visits;
};

const readVisit = async (visit: NodeFeedItem) => {
	const ports = await firstValueFrom(
		visit.foldedEventsFromPorts.pipe(take(1)),
	);
	const segments = [];
	for (const port of ports) {
		const items = await firstValueFrom(port.stream.pipe(take(1)));
		segments.push({
			portId: port.portId,
			items: items.map((item) => ({
				source: item.source,
				state: item.state,
				value: item.value,
				meta: item.meta,
			})),
		});
	}
	return {
		nodeId: visit.nodeId,
		isClosed: visit.isClosed,
		hasResult: visit.hasResult,
		segments,
	};
};

const expectSameReplay = async (
	events: readonly RuntimeRunnerEvent[],
): Promise<readonly RuntimeRunnerEvent[]> => {
	const folded = foldLog(events);
	expect(await projectFeed(folded)).toEqual(await projectFeed(events));
	const rawSnap = snapshotFor(events);
	const foldedSnap = snapshotFor(folded);
	for (const nodeId of ['agent', 'sink']) {
		expect(
			replayNodeChromeFromSnapshot(foldedSnap, nodeId, catalog),
		).toEqual(replayNodeChromeFromSnapshot(rawSnap, nodeId, catalog));
		expect(replayNodeHitlFromSnapshot(foldedSnap, nodeId, catalog)).toEqual(
			replayNodeHitlFromSnapshot(rawSnap, nodeId, catalog),
		);
	}
	return folded;
};

describe('folded feed log replay', () => {
	it('replays folded growing chunks as the same rows', async () => {
		const events: readonly RuntimeRunnerEvent[] = [
			outputEvent('agent', 'reasoning', 'Think'),
			outputEvent('agent', 'reasoning', 'ing'),
			outputEvent('agent', 'progress', 'scan\n', {
				feed: { role: 'progress', streaming: true },
			}),
			outputEvent('agent', 'progress', 'embed\n', {
				feed: { role: 'progress', streaming: true },
			}),
			outputEvent('agent', 'shell', 'ls', {
				feed: { role: 'shell', streaming: true },
			}),
			outputEvent('agent', 'shell', ' -l', {
				feed: { role: 'shell', streaming: true },
			}),
			outputEvent('agent', 'draft', 'Hel'),
			outputEvent('agent', 'draft', 'lo'),
			outputEvent('agent', 'tool', 'lookup'),
			outputEvent('agent', 'draft', 'wor'),
			outputEvent('agent', 'draft', 'ld'),
			outputEvent('agent', 'result', 'answer'),
		];

		const folded = await expectSameReplay(events);
		const rows = await projectFeed(events);
		const draftValues = rows
			.flatMap((visit) => visit.segments)
			.filter((segment) => segment.portId === 'draft')
			.flatMap((segment) => segment.items.map((item) => item.value));

		expect(folded.length).toBeLessThan(events.length);
		expect(foldLog(folded)).toEqual(folded);
		expect(draftValues).toEqual(['Hello', 'world']);
	});

	it('replays unmerged boundary frames as the same rows', async () => {
		const events: readonly RuntimeRunnerEvent[] = [
			outputEvent('agent', 'draft', 'A', { edgeIds: [edge('e1')] }),
			outputEvent('agent', 'draft', 'B', { edgeIds: [edge('e2')] }),
			outputEvent('agent', 'draft', 'C', {
				feed: { role: 'draft', streaming: true },
			}),
			outputEvent('agent', 'draft', 'D', {
				feed: {
					role: 'draft',
					streaming: true,
					closesPreviousVisit: true,
				},
			}),
			outputEvent('agent', 'draft', { n: 1 }),
			outputEvent('agent', 'draft', { n: 2 }),
			outputEvent('agent', 'draft', 'pre'),
			outputEvent('agent', 'draft', null, { state: 'pending' }),
			outputEvent('agent', 'draft', 'post'),
			outputEvent('agent', 'draft', 'boom', { state: 'error' }),
			outputEvent('agent', 'tool', 'call read'),
			outputEvent('agent', 'tool', 'file contents'),
			outputEvent('agent', 'result', 'one'),
			outputEvent('agent', 'result', 'two'),
			outputEvent('agent', 'recovery', 'still working'),
			outputEvent('agent', 'recovery', 'still working'),
			outputEvent('agent', 'note', 'hidden', {
				feed: { role: 'none', streaming: true },
			}),
			outputEvent('agent', 'note', 'hidden', {
				feed: { role: 'none', streaming: true },
			}),
			outputEvent('agent', 'draft', 'left'),
			['done', runId()],
			outputEvent('agent', 'draft', 'right'),
		];

		await expectSameReplay(events);
	});

	it('keeps a wired streaming lane unmerged and equivalent', async () => {
		const wired = edge('wired');
		const events: readonly RuntimeRunnerEvent[] = [
			outputEvent('agent', 'draft', 'a', { edgeIds: [wired] }),
			inputEvent('sink', 'value', 'a', {
				edgeIds: [wired],
				feed: { role: 'draft', streaming: true },
			}),
			outputEvent('agent', 'draft', 'b', { edgeIds: [wired] }),
			inputEvent('sink', 'value', 'b', {
				edgeIds: [wired],
				feed: { role: 'draft', streaming: true },
			}),
		];

		const folded = await expectSameReplay(events);
		expect(folded).toEqual(events);
	});

	it('replays hitl and recovery chrome the same after folding drafts', async () => {
		const events: readonly RuntimeRunnerEvent[] = [
			inputEvent('agent', 'prompt', 'go'),
			outputEvent('agent', 'draft', 'Hel'),
			outputEvent('agent', 'draft', 'lo'),
			inputEvent('agent', 'reply', 'continue'),
			outputEvent('agent', 'recovery', {
				code: 'suspended',
				text: 'paused',
			}),
		];

		const folded = await expectSameReplay(events);
		expect(folded.length).toBeLessThan(events.length);
	});
});
