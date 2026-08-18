import { describe, expect, it } from 'vitest';
import { graphHasCycle } from '../../runtime-helpers.js';
import { createConstantTestNode } from '../nodes/constant-node.js';
import { createDelayTestNode } from '../nodes/delay-node.js';
import { createJoinTestNode } from '../nodes/join-node.js';
import { createPreviewTestNode } from '../nodes/preview-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	waitForOutput,
	wireEdge,
} from './workflow-events.js';

function createJoinScenario(): RuntimeHarness {
	const runtime = createRuntimeHarness();

	runtime.editor.addNode(
		createConstantTestNode({ nodeId: 'a', value: 'Hello' }),
	);
	runtime.editor.addNode(
		createConstantTestNode({ nodeId: 'b', value: ' world' }),
	);
	runtime.editor.addNode(
		createDelayTestNode({ nodeId: 'delay-a', delayMs: 1 }),
	);
	runtime.editor.addNode(
		createDelayTestNode({ nodeId: 'delay-b', delayMs: 1 }),
	);
	runtime.editor.addNode(
		createJoinTestNode({ nodeId: 'join', separator: '\n' }),
	);
	runtime.editor.addNode(createPreviewTestNode({ nodeId: 'preview' }));

	wireEdge(runtime.editor, {
		fromNodeId: 'a',
		fromPort: ['value', 0],
		toNodeId: 'delay-a',
		toPort: ['value', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'b',
		fromPort: ['value', 0],
		toNodeId: 'delay-b',
		toPort: ['value', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'delay-a',
		fromPort: ['value', 0],
		toNodeId: 'join',
		toPort: ['lines', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'delay-b',
		fromPort: ['value', 0],
		toNodeId: 'join',
		toPort: ['lines', 1],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'join',
		fromPort: ['text', 0],
		toNodeId: 'preview',
		toPort: ['text', 0],
	});

	return runtime;
}

describe('join workflow (events$)', () => {
	it('emits preview text after join', async () => {
		const runtime = createJoinScenario();

		expect(graphHasCycle(runtime.editor.getEdges())).toBe(false);

		const runId = runtime.runner.start();

		const preview = await waitForOutput(runtime, 'preview', 'text', runId);
		expect(preview[3].value).toBe('Hello\n world');
	});
});
