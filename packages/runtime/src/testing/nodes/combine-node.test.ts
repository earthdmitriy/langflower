import { describe, expect, it } from 'vitest';
import { readOutputValue } from '../readOutputValue.js';
import { createRuntimeHarness } from '../workflows/workflow-events.js';
import { createCombineTestNode } from './combine-node.js';
import { createConstantTestNode } from './constant-node.js';

describe('createCombineTestNode', () => {
	it('merges inputs with combineLatest', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'a', value: 'foo' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'b', value: 'bar' }),
		);
		runtime.editor.addNode(createCombineTestNode({ nodeId: 'join' }));
		runtime.editor.addEdge({
			fromNodeId: 'a',
			fromPort: ['value', 0],
			toNodeId: 'join',
			toPort: ['a', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'b',
			fromPort: ['value', 0],
			toNodeId: 'join',
			toPort: ['b', 0],
		});

		runtime.runner.start();

		const result = await readOutputValue(
			runtime.editor.getNode('join').outputs.combined,
		);
		expect(result).toEqual({
			a: 'foo',
			b: 'bar',
			combined: 'foo|bar',
		});
	});
});
