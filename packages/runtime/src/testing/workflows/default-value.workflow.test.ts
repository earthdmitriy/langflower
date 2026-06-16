import { describe, expect, it } from 'vitest';
import {
	combineStatefulObservables,
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { delay, of } from 'rxjs';
import type { PortMeta, RuntimeNode } from '../../types.js';
import { createConstantTestNode } from '../nodes/constant-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	waitForOutput,
	wireEdge,
} from './workflow-events.js';

/**
 * Pass-through `value` delayed by the `delay` input. The `delay` port carries
 * a `defaultValue: 0` so the runner must clear it when the port is wired by an
 * edge — a seeded default on a connected port must not drive the combine.
 */
function createDefaultDelayTestNode(nodeId: string): RuntimeNode {
	const valueIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const delayIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'delay',
			wireType: 'any',
			mode: 'single',
			defaultValue: 0,
		} satisfies PortMeta,
	});
	const output = statefulObservable({
		input: combineStatefulObservables(
			[valueIn, delayIn],
			(values) => values,
		),
		loader: ([value, ms]) =>
			of(value).pipe(delay(Math.max(0, Number(ms) || 0))),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId,
		inputs: { value: valueIn, delay: delayIn },
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
}

function wire(
	harness: RuntimeHarness,
	fromNodeId: string,
	toNodeId: string,
	toPort: string,
): void {
	wireEdge(harness.editor, {
		fromNodeId,
		fromPort: ['value', 0],
		toNodeId,
		toPort: [toPort, 0],
	});
}

describe('default input value (applied only when port is unconnected)', () => {
	it('drops the seeded default when the port is driven by an edge', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hello' }),
		);
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'ms', value: '1000' }),
		);
		const delay = createDefaultDelayTestNode('d');
		// Simulate the server seeding the port default before the run.
		delay.inputs.delay.connect(of(0));
		harness.editor.addNode(delay);

		wire(harness, 'src', 'd', 'value');
		wire(harness, 'ms', 'd', 'delay');

		const startedAt = Date.now();
		const runId = harness.runner.start();

		const event = await waitForOutput(harness, 'd', 'value', runId);

		expect(event.value).toBe('hello');
		// The seeded 0 must be cleared; the edge (1000) governs the delay.
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900);
	});

	it('keeps the seeded default when the port is left unconnected', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hello' }),
		);
		const delay = createDefaultDelayTestNode('d');
		delay.inputs.delay.connect(of(0));
		harness.editor.addNode(delay);

		wire(harness, 'src', 'd', 'value');

		const startedAt = Date.now();
		const runId = harness.runner.start();

		const event = await waitForOutput(harness, 'd', 'value', runId);

		expect(event.value).toBe('hello');
		// Unconnected delay port seeds from defaultValue (0) → immediate emit.
		expect(Date.now() - startedAt).toBeLessThan(200);
	});
});
