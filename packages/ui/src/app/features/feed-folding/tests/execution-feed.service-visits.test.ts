import { describe, expect, it } from 'vitest';
import {
	createExecutionFeedHarness,
	inputEvent,
	outputEvent,
	paletteDefinition,
	readItems,
	readPorts,
} from './execution-feed.service.fixture';

const concat = paletteDefinition('concat', [
	{ portId: 'text', direction: 'out' },
]);

const agent = paletteDefinition('agent', [
	{ portId: 'tools', direction: 'in' },
	{ portId: 'userPrompt', direction: 'in' },
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
	{
		portId: 'reasoning',
		direction: 'out',
		role: 'reasoning',
		streaming: true,
	},
	{ portId: 'tool', direction: 'out', role: 'tool', streaming: true },
	{ portId: 'result', direction: 'out', role: 'result' },
]);

describe('ExecutionFeedService visit reuse', () => {
	it('appends consecutive non-streaming frames while the visit remains last', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ concat: 'concat' }, [concat]);

		harness.raw.outputEmitted$.next(outputEvent('concat', 'text', 'one'));
		harness.raw.outputEmitted$.next(outputEvent('concat', 'text', 'two'));

		expect(harness.latestNodes()).toHaveLength(1);
		expect(
			(await readItems(harness.latestNodes()[0]!, 'text')).map(
				(item) => item.value,
			),
		).toEqual(['one', 'two']);
	});

	it('keeps setup inputs and later streaming on one visit while last', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);

		harness.raw.inputReceived$.next(
			inputEvent('agent', 'userPrompt', 'hi'),
		);
		harness.raw.outputEmitted$.next(
			outputEvent('agent', 'reasoning', 'think'),
		);
		harness.raw.outputEmitted$.next(
			outputEvent('agent', 'result', 'hello'),
		);

		const visits = harness.latestNodes();
		expect(visits).toHaveLength(1);
		expect((await readItems(visits[0]!, 'userPrompt'))[0]?.value).toBe(
			'hi',
		);
		expect((await readItems(visits[0]!, 'reasoning'))[0]?.value).toBe(
			'think',
		);
		expect((await readItems(visits[0]!, 'result'))[0]?.value).toBe('hello');
	});

	it('opens a new streaming visit at the bottom after other nodes intervene', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ orchestrator: 'agent', explorer: 'agent' }, [
			agent,
		]);

		harness.raw.inputReceived$.next(
			inputEvent('orchestrator', 'tools', ['glob']),
		);
		harness.raw.inputReceived$.next(
			inputEvent('orchestrator', 'userPrompt', 'go'),
		);
		harness.raw.outputEmitted$.next(
			outputEvent('explorer', 'draft', 'explore'),
		);
		harness.raw.outputEmitted$.next(
			outputEvent('orchestrator', 'reasoning', 'think'),
		);

		const visits = harness.latestNodes();
		expect(visits.map((node) => node.nodeId)).toEqual([
			'orchestrator',
			'explorer',
			'orchestrator',
		]);
		expect(visits[0]!.visitId).not.toBe(visits[2]!.visitId);
		expect(await readItems(visits[0]!, 'tools')).toHaveLength(1);
		expect(await readItems(visits[0]!, 'reasoning')).toEqual([]);
		expect((await readItems(visits[2]!, 'reasoning'))[0]?.value).toBe(
			'think',
		);
	});

	it('keeps interleaved open visits for streaming ports', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ a: 'agent', b: 'agent' }, [agent]);

		for (const event of [
			outputEvent('a', 'draft', 'A1'),
			outputEvent('b', 'draft', 'B1'),
			outputEvent('a', 'draft', 'A2'),
		]) {
			harness.raw.outputEmitted$.next(event);
		}

		expect(harness.latestNodes().map((node) => node.nodeId)).toEqual([
			'a',
			'b',
		]);
		expect(
			(await readItems(harness.latestNodes()[0]!, 'draft')).map(
				(item) => item.value,
			),
		).toEqual(['A1A2']);
		expect(
			(await readItems(harness.latestNodes()[1]!, 'draft')).map(
				(item) => item.value,
			),
		).toEqual(['B1']);
	});

	it('keeps LLM multi-phase timeline as chronological port segments', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);

		for (const event of [
			outputEvent('agent', 'reasoning', 'r1'),
			outputEvent('agent', 'draft', 'd1'),
			outputEvent('agent', 'tool', 't1'),
			outputEvent('agent', 'reasoning', 'r2'),
		]) {
			harness.raw.outputEmitted$.next(event);
		}

		const visit = harness.latestNodes()[0]!;
		expect((await readPorts(visit)).map((port) => port.portId)).toEqual([
			'reasoning',
			'draft',
			'tool',
			'reasoning',
		]);
		expect(
			(await readItems(visit, 'reasoning')).map((item) => item.value),
		).toEqual(['r1', 'r2']);
	});

	it('tracks last draft segment when result lands after tool rounds', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);

		for (const event of [
			outputEvent('agent', 'draft', 'd1'),
			outputEvent('agent', 'tool', 't1'),
			outputEvent('agent', 'draft', 'd2'),
			outputEvent('agent', 'result', 'final'),
		]) {
			harness.raw.outputEmitted$.next(event);
		}

		const visit = harness.latestNodes()[0]!;
		const ports = await readPorts(visit);
		expect(ports.map((port) => port.portId)).toEqual([
			'draft',
			'tool',
			'draft',
			'result',
		]);
		expect(visit.hasResult).toBe(true);
		expect(visit.lastDraftSegmentId).toBe(ports[2]!.segmentId);
		expect(visit.lastDraftSegmentId).not.toBe(ports[0]!.segmentId);
	});

	it('opens a new visit for non-streaming nodes when they are no longer last', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ concat: 'concat', agent: 'agent' }, [
			concat,
			agent,
		]);

		for (const event of [
			outputEvent('concat', 'text', 'c1'),
			outputEvent('agent', 'draft', 'a1'),
			outputEvent('concat', 'text', 'c2'),
		]) {
			harness.raw.outputEmitted$.next(event);
		}

		const visits = harness.latestNodes();
		expect(visits.map((node) => node.nodeId)).toEqual([
			'concat',
			'agent',
			'concat',
		]);
		expect(visits[0]!.visitId).not.toBe(visits[2]!.visitId);
		expect((await readItems(visits[0]!, 'text'))[0]?.value).toBe('c1');
		expect((await readItems(visits[2]!, 'text'))[0]?.value).toBe('c2');
	});
});
