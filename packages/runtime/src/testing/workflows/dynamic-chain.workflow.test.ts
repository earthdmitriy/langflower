import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { PortMeta } from '../../port-meta.js';
import type { RuntimeNode } from '../../types.js';
import {
	createRuntimeHarness,
	waitForOutput,
	wireEdge,
} from './workflow-events.js';

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

function createDynamicRelayNode(nodeId: string): RuntimeNode {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'dynamic',
			mode: 'single',
		} satisfies PortMeta,
	});
	const output = input.with({
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'dynamic',
			fromInput: 'value',
		} satisfies PortMeta,
	});

	return {
		nodeId,
		inputs: { value: input },
		outputs: { value: output },
		bypassPorts: {},
	};
}

function createSinkNode(options: {
	readonly nodeId: string;
	readonly wireType: string;
}): RuntimeNode {
	const { nodeId, wireType } = options;
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType,
			mode: 'single',
		} satisfies PortMeta,
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

describe('dynamic chain workflow', () => {
	it('disconnects downstream dynamic edges when upstream pin is removed', async () => {
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
		runtime.editor.addNode(createDynamicRelayNode('relay-a'));
		runtime.editor.addNode(createDynamicRelayNode('relay-b'));
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'text-sink',
				wireType: 'string',
			}),
		);
		runtime.editor.addNode(
			createSinkNode({
				nodeId: 'number-sink',
				wireType: 'number',
			}),
		);

		wireEdge(runtime.editor, {
			fromNodeId: 'text-source',
			fromPort: ['value', 0],
			toNodeId: 'relay-a',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'relay-a',
			fromPort: ['value', 0],
			toNodeId: 'relay-b',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'relay-b',
			fromPort: ['value', 0],
			toNodeId: 'text-sink',
			toPort: ['value', 0],
		});

		const textOutputPromise = waitForOutput(runtime, 'text-sink', 'value');
		runtime.runner.start();
		const textOutput = await textOutputPromise;
		expect(textOutput.value).toBe('hello');

		runtime.runner.interrupt('cancel');

		const upstreamEdge = runtime.editor
			.getEdges()
			.find((edge) => edge.fromNodeId === 'text-source');

		expect(upstreamEdge).toBeDefined();
		expect(
			runtime.editor.removeEdge(upstreamEdge!.edgeId).length,
		).toBeGreaterThan(0);
		expect(runtime.editor.getEdges()).toEqual([]);

		wireEdge(runtime.editor, {
			fromNodeId: 'number-source',
			fromPort: ['value', 0],
			toNodeId: 'relay-a',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'relay-a',
			fromPort: ['value', 0],
			toNodeId: 'relay-b',
			toPort: ['value', 0],
		});
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'relay-b',
				fromPort: ['value', 0],
				toNodeId: 'text-sink',
				toPort: ['value', 0],
			}),
		).toBe(false);
		wireEdge(runtime.editor, {
			fromNodeId: 'relay-b',
			fromPort: ['value', 0],
			toNodeId: 'number-sink',
			toPort: ['value', 0],
		});

		const numberOutputPromise = waitForOutput(
			runtime,
			'number-sink',
			'value',
		);
		runtime.runner.start();
		const numberOutput = await numberOutputPromise;
		expect(numberOutput.value).toBe(42);
	});
});
