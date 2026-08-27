import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';
import type { NodeFeedItem } from '../types';
import {
	createExecutionFeedHarness,
	inputEvent,
	outputEvent,
	paletteDefinition,
	readItems,
} from './execution-feed.service.fixture';

const readPortIds = async (node: NodeFeedItem): Promise<readonly string[]> => {
	const ports = await firstValueFrom(
		node.foldedEventsFromPorts.pipe(take(1)),
	);
	return ports.map((port) => port.portId);
};

describe('ExecutionFeedService unmarked inputs', () => {
	it('omits unmarked input values from the feed', async () => {
		const agent = paletteDefinition('agent', [
			{ portId: 'prompt', direction: 'in' },
			{
				portId: 'draft',
				direction: 'out',
				role: 'draft',
				streaming: true,
			},
		]);
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(inputEvent('agent', 'prompt', 'hello'));

		expect(harness.latestNodes()).toEqual([]);
	});

	it('drops pending null output frames and does not stringify them into the visit', async () => {
		const agent = paletteDefinition('agent', [
			{
				portId: 'reasoning',
				direction: 'out',
				role: 'reasoning',
				streaming: true,
			},
			{
				portId: 'draft',
				direction: 'out',
				role: 'draft',
				streaming: true,
			},
			{
				portId: 'tool',
				direction: 'out',
				role: 'tool',
				streaming: true,
			},
		]);
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'reasoning', 'context', {
				feed: { role: 'reasoning', streaming: true },
			}),
		);
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'reasoning', null, {
				state: 'pending',
				feed: { role: 'reasoning', streaming: true },
			}),
		);
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'tool', null, {
				state: 'pending',
				feed: { role: 'tool', streaming: true },
			}),
		);
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'draft', null, {
				state: 'pending',
				feed: { role: 'draft', streaming: true },
			}),
		);
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'reasoning', ' more', {
				feed: { role: 'reasoning', streaming: true },
			}),
		);

		const visit = harness.latestNodes()[0]!;
		expect(await readPortIds(visit)).toEqual(['reasoning']);
		expect(
			(await readItems(visit, 'reasoning')).map((item) => item.value),
		).toEqual(['context more']);
	});

	it('drops pending undefined input frames and keeps the real marked value', async () => {
		const agent = paletteDefinition('agent', [
			{ portId: 'prompt', direction: 'in', role: 'result' },
		]);
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(
			inputEvent('agent', 'prompt', undefined, { state: 'pending' }),
		);
		harness.raw.runnerPort$.next(inputEvent('agent', 'prompt', 'ready'));

		const items = await readItems(harness.latestNodes()[0]!, 'prompt');
		expect(items.map((item) => item.value)).toEqual(['ready']);
		expect(
			items.every(
				(item) =>
					item.value !== undefined &&
					String(item.value) !== 'undefined',
			),
		).toBe(true);
	});

	it('omits palette feed.role none while keeping marked ports', async () => {
		const agent = paletteDefinition('agent', [
			{ portId: 'hiddenIn', direction: 'in', role: 'none' },
			{ portId: 'hiddenOut', direction: 'out', role: 'none' },
			{
				portId: 'draft',
				direction: 'out',
				role: 'draft',
				streaming: true,
			},
		]);
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(inputEvent('agent', 'hiddenIn', 'secret'));
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'hiddenOut', 'secret-out'),
		);
		harness.raw.runnerPort$.next(outputEvent('agent', 'draft', 'visible'));

		const visit = harness.latestNodes()[0]!;
		const portIds = await readPortIds(visit);
		expect(portIds).toEqual(['draft']);
		expect(await readItems(visit, 'hiddenIn')).toEqual([]);
		expect(await readItems(visit, 'hiddenOut')).toEqual([]);
		expect((await readItems(visit, 'draft'))[0]?.value).toBe('visible');
	});

	it('omits event feed.role none even when palette marks the port', async () => {
		const agent = paletteDefinition('agent', [
			{
				portId: 'draft',
				direction: 'out',
				role: 'draft',
				streaming: true,
			},
		]);
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(
			outputEvent('agent', 'draft', 'hidden', { feed: { role: 'none' } }),
		);

		expect(harness.latestNodes()).toEqual([]);
	});

	it('omits empty FeedPortMeta on the event', async () => {
		const agent = paletteDefinition('agent', [
			{ portId: 'prompt', direction: 'in', role: 'result' },
		]);
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(
			inputEvent('agent', 'prompt', 'hello', { feed: {} }),
		);

		expect(harness.latestNodes()).toEqual([]);
	});

	it('omits empty palette FeedPortMeta when the event feed slot is null', async () => {
		const agent = paletteDefinition('agent', [
			{ portId: 'prompt', direction: 'in', emptyFeed: true },
		]);
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(inputEvent('agent', 'prompt', 'hello'));

		expect(harness.latestNodes()).toEqual([]);
	});

	it('keeps separate marked input ports as separate streams', async () => {
		const agent = paletteDefinition('agent', [
			{ portId: 'a', direction: 'in', role: 'result' },
			{ portId: 'b', direction: 'in', role: 'result' },
		]);
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(inputEvent('agent', 'a', 'A'));
		harness.raw.runnerPort$.next(inputEvent('agent', 'b', 'B'));

		const visit = harness.latestNodes()[0]!;
		expect(await readPortIds(visit)).toEqual(['a', 'b']);
		expect((await readItems(visit, 'a'))[0]?.value).toBe('A');
		expect((await readItems(visit, 'b'))[0]?.value).toBe('B');
	});

	it('omits unmarked ports when the event feed slot is null', async () => {
		const agent = paletteDefinition('agent', [
			{ portId: 'prompt', direction: 'in' },
		]);
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(inputEvent('agent', 'prompt', 'hello'));

		expect(harness.latestNodes()).toEqual([]);
	});
});
