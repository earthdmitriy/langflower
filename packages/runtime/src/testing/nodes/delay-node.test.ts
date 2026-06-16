import { describe, expect, it } from 'vitest';
import { readOutputValue } from '../readOutputValue.js';
import { createRuntimeHarness } from '../workflows/workflow-events.js';
import { createConstantTestNode } from './constant-node.js';
import { createDelayTestNode } from './delay-node.js';

describe('createDelayTestNode', () => {
	it('passes value after ms', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'delayed' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'd1', delayMs: 30 }),
		);
		runtime.editor.addEdge({
			fromNodeId: 'src',
			fromPort: ['value', 0],
			toNodeId: 'd1',
			toPort: ['value', 0],
		});

		const startedAt = Date.now();
		runtime.runner.start();
		expect(
			await readOutputValue(runtime.editor.getNode('d1').outputs.value),
		).toBe('delayed');
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);
	});
});
