import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { PortMeta, RuntimeInputPortMode } from '../../port-meta.js';
import type { RuntimeNode } from '../../types.js';
import { createRuntimeHarness, wireEdge } from './workflow-events.js';

function createSourceNode(options: {
	readonly nodeId: string;
	readonly wireType: string;
	readonly value: unknown;
}): RuntimeNode {
	const { nodeId, wireType, value } = options;
	const output = statefulObservable({
		loader: () => of(value),
		meta: { dir: 'out', portId: 'value', wireType } satisfies PortMeta,
	});

	return {
		nodeId,
		inputs: {},
		outputs: { value: output },
		bypassPorts: {},
	};
}

function createSinkNode(options: {
	readonly nodeId: string;
	readonly wireType: string;
	readonly mode?: RuntimeInputPortMode;
}): RuntimeNode {
	const { nodeId, wireType, mode = 'single' } = options;
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: { dir: 'in', portId: 'value', wireType, mode } satisfies PortMeta,
	});
	const output = input.with({
		meta: { dir: 'out', portId: 'value', wireType } satisfies PortMeta,
	});

	return {
		nodeId,
		inputs: { value: input },
		outputs: { value: output },
		bypassPorts: {},
	};
}

describe('wire type workflow', () => {
	it('rejects addEdge when static output and input wire types mismatch', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'number-source',
				wireType: 'number',
				value: 42,
			}),
		);
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'text-sink',
				wireType: 'string',
			}),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'number-source',
				fromPort: ['value', 0],
				toNodeId: 'text-sink',
				toPort: ['value', 0],
			}),
		).toBe(false);
		expect(runtime.editor.getEdges()).toEqual([]);
	});

	it('accepts addEdge when static output and input wire types match', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'text-source',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'text-sink',
				wireType: 'string',
			}),
		);

		wireEdge(runtime.editor, {
			fromNodeId: 'text-source',
			fromPort: ['value', 0],
			toNodeId: 'text-sink',
			toPort: ['value', 0],
		});

		expect(runtime.editor.getEdges()).toHaveLength(1);
	});

	it('accepts addEdge when static output connects to unpinned dynamic input', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'text-source',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'dynamic-sink',
				wireType: 'dynamic',
			}),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'text-source',
				fromPort: ['value', 0],
				toNodeId: 'dynamic-sink',
				toPort: ['value', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'text-source',
				toNodeId: 'dynamic-sink',
			}),
		);
		expect(runtime.editor.getEdges()).toHaveLength(1);
	});

	it('rejects addEdge when wire type mismatches pinned dynamic multi input', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'text-source',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'number-source',
				wireType: 'number',
				value: 42,
			}),
		);
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'dynamic-sink',
				wireType: 'dynamic',
				mode: 'merge',
			}),
		);

		wireEdge(runtime.editor, {
			fromNodeId: 'text-source',
			fromPort: ['value', 0],
			toNodeId: 'dynamic-sink',
			toPort: ['value', 0],
		});

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'number-source',
				fromPort: ['value', 0],
				toNodeId: 'dynamic-sink',
				toPort: ['value', 1],
			}),
		).toBe(false);
		expect(runtime.editor.getEdges()).toHaveLength(1);
	});

	it('accepts addEdge when any input accepts static outputs of different types', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'text-source',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'number-source',
				wireType: 'number',
				value: 42,
			}),
		);
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'any-sink',
				wireType: 'any',
				mode: 'merge',
			}),
		);

		wireEdge(runtime.editor, {
			fromNodeId: 'text-source',
			fromPort: ['value', 0],
			toNodeId: 'any-sink',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'number-source',
			fromPort: ['value', 0],
			toNodeId: 'any-sink',
			toPort: ['value', 1],
		});

		expect(runtime.editor.getEdges()).toHaveLength(2);
	});

	it('accepts addEdge when embed-handle output matches embed-handle input', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'embed-source',
				wireType: 'embed-handle',
				value: {},
			}),
		);
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'embed-sink',
				wireType: 'embed-handle',
			}),
		);

		wireEdge(runtime.editor, {
			fromNodeId: 'embed-source',
			fromPort: ['value', 0],
			toNodeId: 'embed-sink',
			toPort: ['value', 0],
		});

		expect(runtime.editor.getEdges()).toHaveLength(1);
	});

	it('rejects addEdge between tool-handle and embed-handle', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'tools-source',
				wireType: 'tool-handle',
				value: {},
			}),
		);
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'embed-sink',
				wireType: 'embed-handle',
			}),
		);
		runtime.editor.addNode(
			createSourceNode({
				nodeId: 'embed-source',
				wireType: 'embed-handle',
				value: {},
			}),
		);
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'tools-sink',
				wireType: 'tool-handle',
			}),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'tools-source',
				fromPort: ['value', 0],
				toNodeId: 'embed-sink',
				toPort: ['value', 0],
			}),
		).toBe(false);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'embed-source',
				fromPort: ['value', 0],
				toNodeId: 'tools-sink',
				toPort: ['value', 0],
			}),
		).toBe(false);
		expect(runtime.editor.getEdges()).toEqual([]);
	});
});
