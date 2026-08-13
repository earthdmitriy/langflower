import { describe, expect, it } from 'vitest';
import type { PortStreamItem } from '../types';
import type { RuntimeRunnerEvent } from '@langflower/runtime';
import {
	createExecutionFeedHarness,
	outputEvent,
	paletteDefinition,
	runId,
} from './execution-feed.service.fixture';

const agent = paletteDefinition('agent', [
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
]);

describe('ExecutionFeedService lifecycle', () => {
	it('updates an already-unwrapped port stream from later bridge frames', () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next(outputEvent('agent', 'draft', 'first'));

		const seen: Array<readonly PortStreamItem[]> = [];
		let innerSubscription: { unsubscribe(): void } | undefined;
		const portSubscription = harness
			.latestNodes()[0]
			?.foldedEventsFromPorts.subscribe((ports) => {
				if (innerSubscription === undefined) {
					innerSubscription = ports
						.find((port) => port.portId === 'draft')
						?.stream.subscribe((items) => seen.push(items));
				}
			});

		harness.raw.runnerPort$.next(outputEvent('agent', 'draft', 'second'));

		expect(seen.at(-1)?.map((item) => item.value)).toEqual(['firstsecond']);
		innerSubscription?.unsubscribe();
		portSubscription?.unsubscribe();
	});

	it('drops symbol ports and lifecycle done frames', () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);
		harness.raw.runnerPort$.next([
			'out',
			'agent',
			Symbol('bypass'),
			'value',
			'hidden',
		] as unknown as RuntimeRunnerEvent);
		harness.raw.runnerPort$.next(['done', runId()] as RuntimeRunnerEvent);

		expect(harness.latestNodes()).toEqual([]);
	});
});
