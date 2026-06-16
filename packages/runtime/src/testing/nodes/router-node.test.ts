import { describe, expect, it } from 'vitest';
import type { RuntimeWireType } from '../../types.js';
import { createConstantTestNode } from './constant-node.js';
import { createDelayTestNode } from './delay-node.js';
import { createRuntimeHarness } from '../workflows/workflow-events.js';
import { createRouterTestNode } from './router-node.js';

describe('createRouterTestNode', () => {
	it('declares bypass metadata without manual IO', () => {
		const node = createRouterTestNode({ nodeId: 'router' });

		expect(node.inputs).toEqual({});
		expect(node.outputs).toEqual({});
		expect(node.bypassPorts).toEqual({ ch: 'dynamic' });
	});

	it('materializes default channel when added to the editor', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));

		const node = runtime.editor.getNode('router');
		expect(node).toBeTruthy();

		if (!node) return;

		expect(Object.keys(node.inputs)).toEqual(['ch']);
		expect(Object.keys(node.outputs)).toEqual(['ch']);
		expect(node.inputs.ch?.meta.portId).toBe('ch');
	});

	it('materializes extra output channels lazily on addEdge', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'x' }),
		);
		runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
		runtime.editor.addNode(createDelayTestNode({ nodeId: 'sink' }));

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'src',
				fromPort: ['value', 0],
				toNodeId: 'router',
				toPort: ['ch', 1],
			}),
		).toBeTruthy();

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'router',
				fromPort: ['ch', 1],
				toNodeId: 'sink',
				toPort: ['value', 0],
			}),
		).toBeTruthy();

		const node = runtime.editor.getNode('router');
		expect(node).toBeTruthy();

		if (!node) return;

		expect(Object.keys(node.inputs)).toEqual(['ch']);
		expect(Object.keys(node.outputs).sort()).toEqual(['ch', 'ch@1']);
	});

	it('does not keep lazy output channels from failed edges', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'target', value: 'x' }),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'router',
				fromPort: ['ch@1', 0],
				toNodeId: 'target',
				toPort: ['value', 0],
			}),
		).toBe(false);

		const node = runtime.editor.getNode('router');
		expect(node).toBeTruthy();

		if (!node) return;

		expect(Object.keys(node.outputs)).toEqual(['ch']);
	});

	it('accepts custom bypass base port config', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createRouterTestNode({
				nodeId: 'router',
				bypassPorts: { lane: 'string' as RuntimeWireType },
			}),
		);

		const node = runtime.editor.getNode('router');
		expect(node).toBeTruthy();

		if (!node) return;

		expect(node.bypassPorts).toEqual({ lane: 'string' });
		expect(Object.keys(node.inputs)).toEqual(['lane']);
		expect(node.inputs.lane?.meta.portId).toBe('lane');
	});
});
