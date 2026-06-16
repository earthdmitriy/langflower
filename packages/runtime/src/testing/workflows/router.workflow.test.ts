import { describe, expect, it } from 'vitest';
import { graphHasCycle } from '../../runtime-helpers.js';
import { createConstantTestNode } from '../nodes/constant-node.js';
import { createDelayTestNode } from '../nodes/delay-node.js';
import { createRouterTestNode } from '../nodes/router-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	runAndCollectEvents,
	waitForOutput,
	wireEdge,
} from './workflow-events.js';

function createRouterChannelsScenario(): RuntimeHarness {
	const runtime = createRuntimeHarness();

	runtime.editor.addNode(
		createConstantTestNode({ nodeId: 'src-a', value: 'alpha' }),
	);
	runtime.editor.addNode(
		createConstantTestNode({ nodeId: 'src-b', value: 'beta' }),
	);
	runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
	runtime.editor.addNode(
		createDelayTestNode({ nodeId: 'sink-a', delayMs: 5 }),
	);
	runtime.editor.addNode(
		createDelayTestNode({ nodeId: 'sink-b', delayMs: 5 }),
	);

	wireEdge(runtime.editor, {
		fromNodeId: 'src-a',
		fromPort: ['value', 0],
		toNodeId: 'router',
		toPort: ['ch', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'src-b',
		fromPort: ['value', 0],
		toNodeId: 'router',
		toPort: ['ch', 1],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'router',
		fromPort: ['ch', 0],
		toNodeId: 'sink-a',
		toPort: ['value', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'router',
		fromPort: ['ch', 1],
		toNodeId: 'sink-b',
		toPort: ['value', 0],
	});

	return runtime;
}

function createRouterFanOutScenario(): RuntimeHarness {
	const runtime = createRuntimeHarness();

	runtime.editor.addNode(
		createConstantTestNode({ nodeId: 'src', value: 'ping' }),
	);
	runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
	runtime.editor.addNode(createDelayTestNode({ nodeId: 'd1', delayMs: 5 }));
	runtime.editor.addNode(createDelayTestNode({ nodeId: 'd2', delayMs: 5 }));

	wireEdge(runtime.editor, {
		fromNodeId: 'src',
		fromPort: ['value', 0],
		toNodeId: 'router',
		toPort: ['ch', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'router',
		fromPort: ['ch', 0],
		toNodeId: 'd1',
		toPort: ['value', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'router',
		fromPort: ['ch', 0],
		toNodeId: 'd2',
		toPort: ['value', 0],
	});

	return runtime;
}

describe('router workflow (events$)', () => {
	it('passes each bypass channel independently', async () => {
		const runtime = createRouterChannelsScenario();

		expect(graphHasCycle(runtime.editor.getEdges())).toBe(false);

		const runId = runtime.runner.start();

		const branchA = await waitForOutput(runtime, 'sink-a', 'value', runId);
		const branchB = await waitForOutput(runtime, 'sink-b', 'value', runId);

		expect(branchA.runId).toBe(runId);
		expect(branchB.runId).toBe(runId);
		expect(branchA.value).toBe('alpha');
		expect(branchB.value).toBe('beta');
	});

	it('fans out one router channel to multiple downstream nodes', async () => {
		const runtime = createRouterFanOutScenario();

		expect(graphHasCycle(runtime.editor.getEdges())).toBe(false);

		const runId = runtime.runner.start();

		const branchA = await waitForOutput(runtime, 'd1', 'value', runId);
		const branchB = await waitForOutput(runtime, 'd2', 'value', runId);

		expect(branchA.runId).toBe(runId);
		expect(branchB.runId).toBe(runId);
		expect(branchA.value).toBe('ping');
		expect(branchB.value).toBe('ping');
	});

	it('delivers to slot 0 even when slot 1 source never emits', async () => {
		const runtime = createRuntimeHarness();

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hello' }),
		);
		runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'sink', delayMs: 5 }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'slow-node', delayMs: 100_000 }),
		);

		// Slot 0: src → router
		wireEdge(runtime.editor, {
			fromNodeId: 'src',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 0],
		});
		// Slot 1: slow-node → router (never emits within timeout)
		wireEdge(runtime.editor, {
			fromNodeId: 'slow-node',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 1],
		});
		// Router slot 0 → sink
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 0],
			toNodeId: 'sink',
			toPort: ['value', 0],
		});

		const runId = runtime.runner.start();

		const result = await waitForOutput(runtime, 'sink', 'value', runId);

		expect(result.runId).toBe(runId);
		expect(result.value).toBe('hello');
	});

	it('slot 1 delivers after slot 0 upstream is removed', async () => {
		const runtime = createRuntimeHarness();

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'stall', value: '' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'emit', value: 'data' }),
		);
		runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'sink', delayMs: 5 }),
		);

		// stall → router slot 0, emit → router slot 1
		wireEdge(runtime.editor, {
			fromNodeId: 'stall',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'emit',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 1],
		});
		// router slot 1 → sink
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 1],
			toNodeId: 'sink',
			toPort: ['value', 0],
		});

		// First run — slot 1 delivers
		const runId1 = runtime.runner.start();
		const r1 = await waitForOutput(runtime, 'sink', 'value', runId1);
		expect(r1.value).toBe('data');

		// Stop, remove stall → router edge, run again
		runtime.runner.interrupt('cancel');

		const stallEdge = runtime.editor
			.getEdges()
			.find(
				(e) =>
					e.fromNodeId === 'stall' &&
					e.toNodeId === 'router' &&
					e.toPort[0] === 'ch' &&
					e.toPort[1] === 0,
			);
		expect(stallEdge).toBeDefined();
		runtime.editor.removeEdge(stallEdge!.edgeId);

		const runId2 = runtime.runner.start();
		const r2 = await waitForOutput(runtime, 'sink', 'value', runId2);
		expect(r2.runId).toBe(runId2);
		expect(r2.value).toBe('data');
	});

	it('rewires emit from slot 1 to slot 0 after removing both edges', async () => {
		const runtime = createRuntimeHarness();

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'stall', value: '' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'emit', value: 'payload' }),
		);
		runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'sink', delayMs: 5 }),
		);

		// stall → router slot 0, emit → router slot 1
		wireEdge(runtime.editor, {
			fromNodeId: 'stall',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'emit',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 1],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 1],
			toNodeId: 'sink',
			toPort: ['value', 0],
		});

		// First run — slot 1 delivers
		const runId1 = runtime.runner.start();
		const r1 = await waitForOutput(runtime, 'sink', 'value', runId1);
		expect(r1.value).toBe('payload');

		runtime.runner.interrupt('cancel');

		// Remove both upstream edges
		const stallEdge = runtime.editor
			.getEdges()
			.find(
				(e) =>
					e.fromNodeId === 'stall' &&
					e.toNodeId === 'router' &&
					e.toPort[0] === 'ch' &&
					e.toPort[1] === 0,
			);
		expect(stallEdge).toBeDefined();
		runtime.editor.removeEdge(stallEdge!.edgeId);

		const emitEdge = runtime.editor
			.getEdges()
			.find(
				(e) =>
					e.fromNodeId === 'emit' &&
					e.toNodeId === 'router' &&
					e.toPort[0] === 'ch' &&
					e.toPort[1] === 1,
			);
		expect(emitEdge).toBeDefined();
		runtime.editor.removeEdge(emitEdge!.edgeId);

		// Downstream edge router.ch[1] → sink should also be removed
		const downstreamGone = runtime.editor
			.getEdges()
			.every(
				(e) =>
					!(
						e.fromNodeId === 'router' &&
						e.fromPort[0] === 'ch' &&
						e.fromPort[1] === 1
					),
			);
		expect(downstreamGone).toBe(true);

		// Reconnect emit → router slot 0
		wireEdge(runtime.editor, {
			fromNodeId: 'emit',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 0],
			toNodeId: 'sink',
			toPort: ['value', 0],
		});

		const runId2 = runtime.runner.start();
		const r2 = await waitForOutput(runtime, 'sink', 'value', runId2);
		expect(r2.runId).toBe(runId2);
		expect(r2.value).toBe('payload');
	});

	it('emits output-emitted telemetry with edgeIds for bypass outputs (BUG CASE 1)', async () => {
		const runtime = createRouterFanOutScenario();

		const routerEdgeIds = runtime.editor
			.getEdges()
			.filter((edge) => edge.fromNodeId === 'router')
			.map((edge) => edge.edgeId);
		expect(routerEdgeIds.length).toBeGreaterThan(0);

		const { runId, events } = await runAndCollectEvents(
			runtime,
			() => runtime.runner.start(),
			50,
		);

		const routerEmits = events.filter(
			(event) =>
				event.kind === 'output-emitted' &&
				event.runId === runId &&
				event.nodeId === 'router',
		);

		// Bypass outputs must emit telemetry so downstream wires can highlight.
		expect(routerEmits.length, 'router output-emitted').toBeGreaterThan(0);

		for (const emit of routerEmits) {
			expect(
				emit.edgeIds,
				'router output-emitted carries outgoing edgeIds',
			).toEqual(expect.arrayContaining(routerEdgeIds));
		}
	});
});
