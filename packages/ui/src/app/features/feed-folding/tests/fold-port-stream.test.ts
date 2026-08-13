import type { RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import {
	foldPortStream,
	replayPortStream,
} from '../operators/fold-port-stream';
import type {
	PortEventFromServer,
	PortFrameMeta,
	PortStreamItem,
} from '../types';
import {
	createExecutionFeedHarness,
	outputEvent,
	paletteDefinition,
	readItems,
	runId,
} from './execution-feed.service.fixture';

const run = 'run-1' as RunId;

type PortStreamFrame = PortEventFromServer & { readonly seq: number };

const frame = (
	seq: number,
	value: unknown,
	meta: PortFrameMeta,
	portId = 'draft',
): PortStreamFrame => ({
	source: 'port',
	kind: 'output-emitted',
	runId: run,
	nodeId: 'agent',
	portId,
	state: 'value',
	value,
	meta,
	seq,
});

const agent = paletteDefinition('agent', [
	{
		portId: 'reasoning',
		direction: 'out',
		role: 'reasoning',
		streaming: true,
	},
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
	{ portId: 'tool', direction: 'out', role: 'tool', streaming: true },
	{ portId: 'result', direction: 'out', role: 'result' },
]);

describe('foldPortStream (event-sourced)', () => {
	it('folds string chunks one event at a time into one growing item', () => {
		const empty: readonly PortStreamItem[] = [];
		const afterHel = foldPortStream(
			empty,
			frame(0, 'Hel', { presentation: 'draft' }),
		);
		const afterLo = foldPortStream(
			afterHel,
			frame(1, 'lo', { presentation: 'draft' }),
		);
		const afterBang = foldPortStream(
			afterLo,
			frame(2, '!', { presentation: 'draft' }),
		);

		expect(afterBang).toEqual([
			expect.objectContaining({
				seq: 0,
				value: 'Hello!',
				meta: { presentation: 'draft' },
			}),
		]);
	});

	it('replays a snapshot array through the same reducer', () => {
		const snapshot = [
			frame(0, 'Think', { presentation: 'reasoning' }),
			frame(1, 'ing', { presentation: 'reasoning' }),
			frame(2, '…', { presentation: 'reasoning' }),
		];
		expect(replayPortStream(snapshot)).toEqual([
			expect.objectContaining({ seq: 0, value: 'Thinking…' }),
		]);
	});

	it('groups tool request/response only by interactionId', () => {
		const items = replayPortStream([
			frame(
				0,
				'call read',
				{ presentation: 'tool-request', interactionId: 'ix-1' },
				'tool',
			),
			frame(
				1,
				'file contents',
				{ presentation: 'tool-response', interactionId: 'ix-1' },
				'tool',
			),
			frame(
				2,
				'call write',
				{ presentation: 'tool-request', interactionId: 'ix-2' },
				'tool',
			),
			frame(
				3,
				'ok',
				{ presentation: 'tool-response', interactionId: 'ix-2' },
				'tool',
			),
		]);
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({
			seq: 0,
			value: 'call read\nfile contents',
			meta: { presentation: 'tool-response', interactionId: 'ix-1' },
		});
		expect(items[1]).toMatchObject({
			seq: 2,
			value: 'call write\nok',
			meta: { presentation: 'tool-response', interactionId: 'ix-2' },
		});
	});

	it('keeps result and user as separate items', () => {
		expect(
			replayPortStream([
				frame(0, 'recovering', { presentation: 'recovery' }),
				frame(1, 'hello', {
					presentation: 'hitl-user',
					origin: 'hitl-reply',
				}),
				frame(2, 'final', { presentation: 'result' }),
			]).map((item) => [item.meta.presentation, item.value]),
		).toEqual([
			['recovery', 'recovering'],
			['hitl-user', 'hello'],
			['result', 'final'],
		]);
	});
});

describe('ExecutionFeedService port-stream collapse', () => {
	it('collapses live reasoning chunks to one PortStreamItem', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		for (const value of ['Think', 'ing', '…']) {
			harness.raw.runnerPort$.next(
				outputEvent('agent', 'reasoning', value),
			);
		}

		const items = await readItems(harness.latestNodes()[0]!, 'reasoning');
		expect(items).toEqual([
			expect.objectContaining({
				seq: 0,
				value: 'Thinking…',
				meta: { presentation: 'reasoning' },
			}),
		]);
	});

	it('snapshot replay matches incremental live fold', async () => {
		const events = [
			outputEvent('agent', 'draft', 'A'),
			outputEvent('agent', 'draft', 'B'),
			outputEvent('agent', 'draft', 'C'),
		];

		const live = createExecutionFeedHarness();
		live.seedCatalog({ agent: 'agent' }, [agent]);
		for (const event of events) {
			live.raw.runnerPort$.next(event);
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
		).toEqual(['ABC']);
		expect(
			(await readItems(snapshot.latestNodes()[0]!, 'draft')).map(
				(item) => item.value,
			),
		).toEqual(['ABC']);
	});

	it('does not invent tool pairs when interactionId is missing', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'tool', 'request-ish'),
		);
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'tool', 'response-ish'),
		);

		const items = await readItems(harness.latestNodes()[0]!, 'tool');
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			value: 'request-ishresponse-ish',
			meta: { presentation: 'tool' },
		});
		expect(items[0]?.meta).not.toHaveProperty('interactionId');
	});

	it('keeps concurrent node streams as separate growing items', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ a: 'agent', b: 'agent' }, [agent]);
		for (const event of [
			outputEvent('a', 'draft', 'A'),
			outputEvent('b', 'draft', 'B'),
			outputEvent('a', 'draft', '1'),
			outputEvent('b', 'draft', '2'),
		]) {
			harness.raw.runnerPort$.next(event);
		}

		const [visitA, visitB] = harness.latestNodes();
		expect(
			(await readItems(visitA!, 'draft')).map((item) => item.value),
		).toEqual(['A1']);
		expect(
			(await readItems(visitB!, 'draft')).map((item) => item.value),
		).toEqual(['B2']);
	});
});
