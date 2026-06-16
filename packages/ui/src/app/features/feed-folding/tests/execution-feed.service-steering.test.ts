import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
import { describe, expect, it } from 'vitest';
import {
	createExecutionFeedHarness,
	inputEvent,
	outputEvent,
	paletteDefinition,
	readItems,
} from './execution-feed.service.fixture';

const agent = paletteDefinition('agent', [
	{ portId: STEER_CONTROL_PORT_ID, direction: 'in', hitl: true },
	{ portId: 'draft', direction: 'out', role: 'draft', streaming: true },
]);

describe('ExecutionFeedService steering', () => {
	it('classifies pause, steer, and resume from raw input events', async () => {
		const harness = createExecutionFeedHarness();
		harness.seedCatalog({ agent: 'agent' }, [agent]);

		harness.raw.inputReceived$.next(
			inputEvent('agent', STEER_CONTROL_PORT_ID, { kind: 'pause' }),
		);
		harness.raw.inputReceived$.next(
			inputEvent('agent', STEER_CONTROL_PORT_ID, {
				kind: 'steer',
				text: 'be concise',
			}),
		);
		harness.raw.inputReceived$.next(
			inputEvent('agent', STEER_CONTROL_PORT_ID, { kind: 'resume' }),
		);
		harness.raw.outputEmitted$.next(
			outputEvent('agent', 'draft', 'resumed'),
		);

		const visits = harness.latestNodes();
		// Same-node while-last: steer controls + resumed draft stay on one card.
		expect(visits).toHaveLength(1);
		const controls = await readItems(visits[0]!, STEER_CONTROL_PORT_ID);
		expect(controls.map((item) => item.meta.presentation)).toEqual([
			'steering-pause',
			'hitl-user',
			'steering-resume',
		]);
		expect(controls[1]).toMatchObject({
			value: 'be concise',
			meta: {
				origin: 'steer',
				payload: { kind: 'steer', text: 'be concise' },
			},
		});
		expect((await readItems(visits[0]!, 'draft'))[0]?.value).toBe(
			'resumed',
		);
	});
});
