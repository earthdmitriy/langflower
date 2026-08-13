import { describe, expect, it } from 'vitest';
import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { delay, of, throwError } from 'rxjs';
import type { PortMeta, RuntimeNode } from '../../types.js';
import { createConstantTestNode } from '../nodes/constant-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	runAndCollectEvents,
	wireEdge,
} from './workflow-events.js';

/** Async loader — emits a `pending` (loading) sentinel, then the value. */
function createPendingTestNode(nodeId: string): RuntimeNode {
	const valueIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const output = statefulObservable({
		input: valueIn.value$,
		loader: (inputValue) => of(inputValue).pipe(delay(10)),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId,
		inputs: { value: valueIn },
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
}

/** Loader that errors — surfaces a `error` telemetry signal. */
function createErrorTestNode(nodeId: string): RuntimeNode {
	const valueIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const output = statefulObservable({
		input: valueIn.value$,
		loader: () => throwError(() => new Error('boom')),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId,
		inputs: { value: valueIn },
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
}

function wire(
	harness: RuntimeHarness,
	fromNodeId: string,
	toNodeId: string,
	toPort = 'value',
): void {
	wireEdge(harness.editor, {
		fromNodeId,
		fromPort: ['value', 0],
		toNodeId,
		toPort: [toPort, 0],
	});
}

describe('port signal states (pending / error via pipe(tap) typeguards)', () => {
	it('emits output-emitted pending then value for an async source', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hi' }),
		);
		harness.editor.addNode(createPendingTestNode('p1'));
		wire(harness, 'src', 'p1');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			80,
		);

		const states = events
			.filter(
				(event) =>
					event[0] === 'out' &&
					event[1] === 'p1' &&
					event[2] === 'value',
			)
			.map((event) => event[3]);

		expect(states).toContain('pending');
		expect(states).toContain('value');
		expect(states.indexOf('pending')).toBeLessThan(states.indexOf('value'));
	});

	it('emits output-emitted error when the source loader throws', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hi' }),
		);
		harness.editor.addNode(createErrorTestNode('e1'));
		wire(harness, 'src', 'e1');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			80,
		);

		const errorEvent = events.find(
			(event) =>
				event[0] === 'out' &&
				event[1] === 'e1' &&
				event[2] === 'value' &&
				event[3] === 'error',
		);

		expect(errorEvent).toBeDefined();
		expect(errorEvent[4]).toBe('boom');
	});

	it('does not forward output error state to downstream nodes', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hi' }),
		);
		harness.editor.addNode(createErrorTestNode('e1'));
		harness.editor.addNode(createPendingTestNode('sink'));
		wire(harness, 'src', 'e1');
		wire(harness, 'e1', 'sink');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			80,
		);

		const sourceError = events.find(
			(event) =>
				event[0] === 'out' && event[1] === 'e1' && event[3] === 'error',
		);
		expect(sourceError).toBeDefined();

		const sinkErrors = events.filter(
			(event) =>
				(event[0] === 'out' || event[0] === 'in') &&
				event[1] === 'sink' &&
				event[3] === 'error',
		);
		expect(sinkErrors).toEqual([]);
	});
});
