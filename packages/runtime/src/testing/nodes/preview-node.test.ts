import { describe, expect, it } from 'vitest';
import { readOutputValue } from '../readOutputValue.js';
import { createRuntimeHarness } from '../workflows/workflow-events.js';
import { createConstantTestNode } from './constant-node.js';
import { createPreviewTestNode } from './preview-node.js';

describe('createPreviewTestNode', () => {
	it('formats wired text as string output', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'preview me' }),
		);
		runtime.editor.addNode(createPreviewTestNode({ nodeId: 'preview' }));
		runtime.editor.addEdge({
			fromNodeId: 'src',
			fromPort: ['value', 0],
			toNodeId: 'preview',
			toPort: ['text', 0],
		});

		runtime.runner.start();

		expect(
			await readOutputValue(
				runtime.editor.getNode('preview').outputs.text,
			),
		).toBe('preview me');
	});
});
