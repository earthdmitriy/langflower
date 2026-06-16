import { describe, expect, it } from 'vitest';
import { readOutputValue } from '../readOutputValue.js';
import { createRuntimeHarness } from '../workflows/workflow-events.js';
import { createConstantTestNode } from './constant-node.js';
import { createJoinTestNode } from './join-node.js';

describe('createJoinTestNode', () => {
	it('joins multi-line inputs with separator', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'a', value: 'Hello' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'b', value: ' world' }),
		);
		runtime.editor.addNode(
			createJoinTestNode({ nodeId: 'join', separator: '\n' }),
		);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'a',
				fromPort: ['value', 0],
				toNodeId: 'join',
				toPort: ['lines', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'a',
				toNodeId: 'join',
			}),
		);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'b',
				fromPort: ['value', 0],
				toNodeId: 'join',
				toPort: ['lines', 1],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'b',
				toNodeId: 'join',
			}),
		);

		runtime.runner.start();

		expect(
			await readOutputValue(runtime.editor.getNode('join').outputs.text),
		).toBe('Hello\n world');
	});

	it('rejects duplicate edges to the same multy slot', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'a', value: 'Hello' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'b', value: ' world' }),
		);
		runtime.editor.addNode(createJoinTestNode({ nodeId: 'join' }));

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'a',
				fromPort: ['value', 0],
				toNodeId: 'join',
				toPort: ['lines', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'a',
				toNodeId: 'join',
			}),
		);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'b',
				fromPort: ['value', 0],
				toNodeId: 'join',
				toPort: ['lines', 0],
			}),
		).toBe(false);
	});
});
