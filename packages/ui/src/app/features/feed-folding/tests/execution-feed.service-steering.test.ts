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

		harness.raw.runnerPort$.next(
			inputEvent('agent', STEER_CONTROL_PORT_ID, { kind: 'pause' }),
		);
		harness.raw.runnerPort$.next(
			inputEvent('agent', STEER_CONTROL_PORT_ID, {
				kind: 'steer',
				text: 'be concise',
			}),
		);
		harness.raw.runnerPort$.next(
			inputEvent('agent', STEER_CONTROL_PORT_ID, { kind: 'resume' }),
		);
		harness.raw.runnerPort$.next(outputEvent('agent', 'draft', 'resumed'));

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

	it('keeps steer file refs on the user row', async () => {
		const harness = createExecutionFeedHarness();
		const withResult = paletteDefinition('agent', [
			{ portId: STEER_CONTROL_PORT_ID, direction: 'in', hitl: true },
			{ portId: 'result', direction: 'out', role: 'result' },
		]);
		harness.seedCatalog({ agent: 'agent' }, [withResult]);

		harness.raw.runnerPort$.next(
			outputEvent(
				'agent',
				'result',
				'![photo](https://example.test/a.png)',
			),
		);
		harness.raw.runnerPort$.next(
			inputEvent('agent', STEER_CONTROL_PORT_ID, {
				kind: 'steer',
				text: 'what is this',
				files: [
					{
						fileId: 'img-1',
						name: 'photo.png',
						mimeType: 'image/png',
						size: 4,
						data: 'base64-pixels',
					},
				],
			}),
		);

		const visits = harness.latestNodes();
		const steerItems = (
			await Promise.all(
				visits.map((visit) => readItems(visit, STEER_CONTROL_PORT_ID)),
			)
		).flat();
		const resultItems = (
			await Promise.all(visits.map((visit) => readItems(visit, 'result')))
		).flat();
		const steer = steerItems[0];
		const result = resultItems[0];
		expect(steer?.value).toBe('what is this');
		expect(steer?.meta).toMatchObject({
			presentation: 'hitl-user',
			origin: 'steer',
			files: [
				{
					fileId: 'img-1',
					name: 'photo.png',
					mimeType: 'image/png',
				},
			],
		});
		expect(steer?.meta).not.toMatchObject({
			files: [expect.objectContaining({ data: 'base64-pixels' })],
		});
		expect(result?.meta).toMatchObject({ presentation: 'result' });
		expect(result?.value).toBe('![photo](https://example.test/a.png)');
	});
});
