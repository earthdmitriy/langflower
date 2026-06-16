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

function createLinearScenario(): RuntimeHarness {
	const runtime = createRuntimeHarness();

	runtime.editor.addNode(
		createConstantTestNode({ nodeId: 'src', value: 'hello' }),
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
		fromNodeId: 'd1',
		fromPort: ['value', 0],
		toNodeId: 'd2',
		toPort: ['value', 0],
	});

	return runtime;
}

describe('linear workflow (events$)', () => {
	it('emits terminal delay output after chained delays', async () => {
		const runtime = createLinearScenario();

		expect(graphHasCycle(runtime.editor.getEdges())).toBe(false);

		const startedAt = Date.now();
		const runId = runtime.runner.start();

		const terminal = await waitForOutput(runtime, 'd2', 'value', runId);
		expect(terminal.runId).toBe(runId);
		expect(terminal.value).toBe('hello');
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(8);
	});
});
