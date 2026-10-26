import { statefulConnection } from '@rx-evo/stateful-observable';
import { describe, expect, it } from 'vitest';
import { createRuntimeHarness } from './testing/workflows/workflow-events.js';
import type {
	NodeId,
	PortMeta,
	RuntimeNode,
	RuntimeRunnerEvent,
} from './types.js';

/** A node that records what its `in` port receives. */
const recorder = (id: string, received: unknown[]): RuntimeNode => {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'in',
			wireType: 'string',
			mode: 'single',
		} satisfies PortMeta,
	});
	input.value$.subscribe((value) => {
		received.push(value);
	});

	return {
		nodeId: id as NodeId,
		inputs: { in: input },
		outputs: {},
		bypassPorts: {},
	};
};

const inFrames = (
	events: readonly RuntimeRunnerEvent[],
	node: string,
): number =>
	events.filter((event) => event[0] === 'in' && event[1] === node).length;

describe('seed values', () => {
	it('delivers a silent seed without a work-log frame', async () => {
		const received: unknown[] = [];
		const { editor, runner } = createRuntimeHarness({ log: true });
		editor.addNode(recorder('sink', received));

		runner.start({
			sink: [
				{ portId: 'in', slotIndex: 0, value: 'quiet', silent: true },
			],
		});
		await Promise.resolve();

		expect(received).toEqual(['quiet']);
		expect(inFrames(runner.eventLog, 'sink')).toBe(0);
	});

	it('a loud seed still leaves its frame', async () => {
		const received: unknown[] = [];
		const { editor, runner } = createRuntimeHarness({ log: true });
		editor.addNode(recorder('sink', received));

		runner.start({ sink: [{ portId: 'in', slotIndex: 0, value: 'loud' }] });
		await Promise.resolve();

		expect(received).toEqual(['loud']);
		expect(inFrames(runner.eventLog, 'sink')).toBe(1);
	});
});
