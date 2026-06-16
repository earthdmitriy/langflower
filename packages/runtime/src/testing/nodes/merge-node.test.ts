import { describe, expect, it } from 'vitest';
import { lastValueFrom, take, toArray } from 'rxjs';
import { createRuntimeHarness } from '../workflows/workflow-events.js';
import { createConstantTestNode } from './constant-node.js';
import { createMergeTestNode } from './merge-node.js';

describe('createMergeTestNode', () => {
	it('flattens multi-input values (merge mode) — one emission per source, not an array', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'a', value: 'foo' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'b', value: 'bar' }),
		);
		runtime.editor.addNode(createMergeTestNode({ nodeId: 'merge' }));
		runtime.editor.addEdge({
			fromNodeId: 'a',
			fromPort: ['value', 0],
			toNodeId: 'merge',
			toPort: ['values', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'b',
			fromPort: ['value', 0],
			toNodeId: 'merge',
			toPort: ['values', 1],
		});

		const output = runtime.editor.getNode('merge').outputs.value;
		const emitted = lastValueFrom(output.value$.pipe(take(2), toArray()));

		runtime.runner.start();

		const result = await emitted;
		expect(result).toEqual(['foo', 'bar']);
	});

	it('rejects duplicate edges to the same multy slot', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'a', value: 'foo' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'b', value: 'bar' }),
		);
		runtime.editor.addNode(createMergeTestNode({ nodeId: 'merge' }));

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'a',
				fromPort: ['value', 0],
				toNodeId: 'merge',
				toPort: ['values', 0],
			}),
		).toEqual(
			expect.objectContaining({ fromNodeId: 'a', toNodeId: 'merge' }),
		);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'b',
				fromPort: ['value', 0],
				toNodeId: 'merge',
				toPort: ['values', 0],
			}),
		).toBe(false);
	});
});
