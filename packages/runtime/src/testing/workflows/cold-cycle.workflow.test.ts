import { statefulConnection } from '@rx-evo/stateful-observable';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { PortMeta, RuntimeNode } from '../../types.js';
import {
	createRuntimeHarness,
	outputValues,
	runAndCollectEvents,
	wireEdge,
} from './workflow-events.js';

/**
 * One-in / one-out relay. Used to build a pure A↔B cycle where every output
 * has an outgoing edge — no end-node driver can subscribe.
 */
const createRelayTestNode = (nodeId: string): RuntimeNode => {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const output = input.with({
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
			fromInput: 'value',
		} satisfies PortMeta,
	});

	return {
		nodeId,
		inputs: { value: input },
		outputs: { value: output },
		bypassPorts: {},
	};
};

describe('cold cycle (no unwired outputs)', () => {
	it('starts running but never emits when every output is wired in a cycle', async () => {
		const harness = createRuntimeHarness({ log: false });
		harness.editor.addNode(createRelayTestNode('a'));
		harness.editor.addNode(createRelayTestNode('b'));

		wireEdge(harness.editor, {
			fromNodeId: 'a',
			fromPort: ['value', 0],
			toNodeId: 'b',
			toPort: ['value', 0],
		});
		wireEdge(harness.editor, {
			fromNodeId: 'b',
			fromPort: ['value', 0],
			toNodeId: 'a',
			toPort: ['value', 0],
		});

		// Seed cannot drive a wired slot — edges clear materialize seeds.
		// With no end-node output, cold streams never subscribe.
		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			150,
		);

		expect(runId).toBeTruthy();
		expect(await firstValueFrom(harness.runner.status$)).toBe('running');
		expect(outputValues(events, 'a', 'value', runId)).toEqual([]);
		expect(outputValues(events, 'b', 'value', runId)).toEqual([]);
		expect(events.some((event) => event[0] === 'done')).toBe(false);

		harness.runner.interrupt('cancel');
		expect(await firstValueFrom(harness.runner.status$)).toBe('stopped');
	});
});
