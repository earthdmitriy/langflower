import { describe, expect, it } from 'vitest';
import { readOutputValue } from '../readOutputValue.js';
import { createRuntimeHarness } from '../workflows/workflow-events.js';
import { createConstantTestNode } from './constant-node.js';

describe('createConstantTestNode', () => {
	it('emits configured string', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'c1', value: 'hello' }),
		);

		runtime.runner.start();

		expect(
			await readOutputValue(runtime.editor.getNode('c1').outputs.value),
		).toBe('hello');
	});
});
