import { describe, expect, it } from 'vitest';
import { isPortTelemetry, type RuntimeRunnerEvent } from '../../types.js';
import { createConstantTestNode } from '../nodes/constant-node.js';
import { createFinishTestNode } from '../nodes/finish-node.js';
import { createRuntimeHarness, wireEdge } from './workflow-events.js';

const flushMicrotask = async (): Promise<void> => {
	await Promise.resolve();
};

describe('start defers wiring to a microtask', () => {
	const createGraph = () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hello' }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'end' }));
		wireEdge(runtime.editor, {
			fromNodeId: 'src',
			fromPort: ['value', 0],
			toNodeId: 'end',
			toPort: ['value', 0],
		});
		return runtime;
	};

	const portEvents = (
		events: readonly RuntimeRunnerEvent[],
	): RuntimeRunnerEvent[] => events.filter((event) => isPortTelemetry(event));

	it('returns runId with no port events until after start() returns', async () => {
		const runtime = createGraph();
		const events: RuntimeRunnerEvent[] = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			events.push(event);
		});

		const runId = runtime.runner.start();
		expect(runId).not.toBe(false);
		expect(runtime.runner.status).toBe('running');
		expect(portEvents(events)).toEqual([]);

		await flushMicrotask();
		expect(portEvents(events).length).toBeGreaterThan(0);

		sub.unsubscribe();
		runtime.runner.dispose();
	});

	it('interrupt before the wire microtask drops ports and stops', async () => {
		const runtime = createGraph();
		const events: RuntimeRunnerEvent[] = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			events.push(event);
		});

		expect(runtime.runner.start()).not.toBe(false);
		runtime.runner.interrupt('cancel');
		expect(runtime.runner.status).toBe('stopped');

		await flushMicrotask();
		expect(portEvents(events)).toEqual([]);

		sub.unsubscribe();
		runtime.runner.dispose();
	});
});
