import { describe, expect, it } from 'vitest';
import { graphHasCycle } from '../../runtime-helpers.js';
import { createConstantTestNode } from '../nodes/constant-node.js';
import { createDelayTestNode } from '../nodes/delay-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	waitForOutput,
	wireEdge,
} from './workflow-events.js';

function createSplitScenario(): RuntimeHarness {
	const runtime = createRuntimeHarness();

	runtime.editor.addNode(
		createConstantTestNode({ nodeId: 'src', value: 'ping' }),
	);
	runtime.editor.addNode(createDelayTestNode({ nodeId: 'd1', delayMs: 5 }));
	runtime.editor.addNode(createDelayTestNode({ nodeId: 'd2', delayMs: 5 }));

	wireEdge(runtime.editor, {
		fromNodeId: 'src',
		fromPort: ['value', 0],
		toNodeId: 'd1',
		toPort: ['value', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'src',
		fromPort: ['value', 0],
		toNodeId: 'd2',
		toPort: ['value', 0],
	});

	return runtime;
}

describe('split workflow (events$)', () => {
	it('emits both branch outputs from one source', async () => {
		const runtime = createSplitScenario();

		expect(graphHasCycle(runtime.editor.getEdges())).toBe(false);

		const runId = runtime.runner.start();

		const branchA = await waitForOutput(runtime, 'd1', 'value', runId);
		const branchB = await waitForOutput(runtime, 'd2', 'value', runId);

		expect(branchA.runId).toBe(runId);
		expect(branchB.runId).toBe(runId);
		expect(branchA.value).toBe('ping');
		expect(branchB.value).toBe('ping');
	});
});
