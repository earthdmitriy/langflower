import { describe, expect, it } from 'vitest';
import {
	createExecutionFeedHarness,
	outputEvent,
	paletteDefinition,
	readItems,
} from './execution-feed.service.fixture';

const agent = paletteDefinition('agent', [
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
	{ portId: 'result', direction: 'out', role: 'result' },
	{ portId: 'tool', direction: 'out', role: 'tool', streaming: true },
]);

describe('ExecutionFeedService concurrent nodes', () => {
	it('keeps alternating active nodes in two open visits', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ a: 'agent', b: 'agent' }, [agent]);

		for (const event of [
			outputEvent('a', 'draft', 'A1'),
			outputEvent('b', 'draft', 'B1'),
			outputEvent('a', 'draft', 'A2'),
			outputEvent('b', 'draft', 'B2'),
		]) {
			harness.raw.outputEmitted$.next(event);
		}

		expect(harness.latestNodes().map((node) => node.nodeId)).toEqual([
			'a',
			'b',
		]);
		expect(
			(await readItems(harness.latestNodes()[0]!, 'draft')).map(
				(item) => [item.value, item.seq],
			),
		).toEqual([['A1A2', 0]]);
		expect(
			(await readItems(harness.latestNodes()[1]!, 'draft')).map(
				(item) => [item.value, item.seq],
			),
		).toEqual([['B1B2', 1]]);
	});

	it('closes one cyclic visit while a sibling remains active', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ a: 'agent', b: 'agent' }, [agent]);

		for (const event of [
			outputEvent('a', 'draft', 'A1'),
			outputEvent('b', 'draft', 'B1'),
			outputEvent('a', 'result', 'done'),
			outputEvent('b', 'tool', 'B tool'),
			outputEvent('a', 'draft', 'A2'),
		]) {
			harness.raw.outputEmitted$.next(event);
		}

		expect(
			harness
				.latestNodes()
				.map((node) => [node.nodeId, node.isClosed, node.visitId]),
		).toEqual([
			['a', true, 'run-1:a:0'],
			['b', false, 'run-1:b:1'],
			['a', false, 'run-1:a:4'],
		]);
		expect(
			(await readItems(harness.latestNodes()[0]!, 'result'))[0]?.value,
		).toBe('done');
	});
});
