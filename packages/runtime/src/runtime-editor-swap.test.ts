import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { filter, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createConstantTestNode } from './testing/nodes/constant-node.js';
import { createDelayTestNode } from './testing/nodes/delay-node.js';
import { createFinishTestNode } from './testing/nodes/finish-node.js';
import {
	createRuntimeHarness,
	waitForOutput,
} from './testing/workflows/workflow-events.js';
import type { NodeId, PortMeta, RuntimeNode } from './types.js';
import { isRuntimeDone } from './types.js';

const asNodeId = (id: string): NodeId => id as NodeId;

const withoutNodeId = (node: RuntimeNode): Omit<RuntimeNode, 'nodeId'> => {
	const { nodeId: _nodeId, ...rest } = node;
	return rest;
};

const requireNode = (
	editor: { getNode: (id: NodeId) => RuntimeNode | false },
	nodeId: string,
): RuntimeNode => {
	const node = editor.getNode(asNodeId(nodeId));

	if (node === false) {
		throw new Error(`expected node ${nodeId}`);
	}

	return node;
};

const createTypedSource = (options: {
	readonly nodeId: string;
	readonly wireType: string;
	readonly value: unknown;
	readonly extra?: { readonly wireType: string; readonly value: unknown };
}): RuntimeNode => {
	const { nodeId, wireType, value, extra } = options;
	const outputs: RuntimeNode['outputs'] = {
		value: statefulObservable({
			loader: () => of(value),
			meta: { dir: 'out', portId: 'value', wireType },
		}),
	};

	if (extra !== undefined) {
		outputs.extra = statefulObservable({
			loader: () => of(extra.value),
			meta: { dir: 'out', portId: 'extra', wireType: extra.wireType },
		});
	}

	return {
		nodeId: asNodeId(nodeId),
		inputs: {},
		outputs,
		bypassPorts: {},
	};
};

const createTypedSink = (options: {
	readonly nodeId: string;
	readonly wireType: string;
}): RuntimeNode => {
	const { nodeId, wireType } = options;
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: { dir: 'in', portId: 'value', wireType, mode: 'single' },
	});

	return {
		nodeId: asNodeId(nodeId),
		inputs: { value: input },
		outputs: {},
		bypassPorts: {},
	};
};

describe('RuntimeEditor.swapNode', () => {
	it('returns false when nodeId is missing', () => {
		const runtime = createRuntimeHarness();
		const next = withoutNodeId(
			createConstantTestNode({ nodeId: 'A', value: 'x' }),
		);

		expect(runtime.editor.swapNode(asNodeId('missing'), next)).toBe(false);
	});

	it('returns false when disposed', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'x' }),
		);
		runtime.editor.dispose();

		expect(
			runtime.editor.swapNode(
				asNodeId('A'),
				withoutNodeId(
					createConstantTestNode({ nodeId: 'A', value: 'y' }),
				),
			),
		).toBe(false);
	});

	it('replaces the instance while locked and leaves removeNode blocked', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'v1' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 5_000 }),
		);
		runtime.editor.addEdge({
			fromNodeId: asNodeId('A'),
			fromPort: ['value', 0],
			toNodeId: asNodeId('B'),
			toPort: ['value', 0],
		});

		const other = requireNode(runtime.editor, 'B');
		runtime.runner.start();

		const swapped = runtime.editor.swapNode(
			asNodeId('A'),
			withoutNodeId(createConstantTestNode({ nodeId: 'A', value: 'v2' })),
		);

		expect(swapped).not.toBe(false);
		if (swapped === false) {
			return;
		}

		expect(swapped.node.nodeId).toBe('A');
		expect(swapped.droppedEdges).toEqual([]);
		expect(runtime.editor.removeNode(asNodeId('A'))).toBe(false);
		expect(runtime.editor.getNode(asNodeId('B'))).toBe(other);

		runtime.runner.interrupt('cancel');
	});

	it('keeps a compatible same-id edge and uses the new execute on next start', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'v1' }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));
		const edge = runtime.editor.addEdge({
			fromNodeId: asNodeId('A'),
			fromPort: ['value', 0],
			toNodeId: asNodeId('finish'),
			toPort: ['value', 0],
		});

		expect(edge).not.toBe(false);

		const firstOut = waitForOutput(runtime, 'finish', 'value');
		const firstDone = firstValueFrom(
			runtime.runner.events$.pipe(filter(isRuntimeDone)),
		);
		runtime.runner.start();
		expect((await firstOut)[3].value).toBe('v1');
		await firstDone;

		const swapped = runtime.editor.swapNode(
			asNodeId('A'),
			withoutNodeId(createConstantTestNode({ nodeId: 'A', value: 'v2' })),
		);

		expect(swapped).not.toBe(false);
		if (swapped === false) {
			return;
		}

		expect(swapped.droppedEdges).toEqual([]);
		expect(runtime.editor.getEdges()).toEqual([edge]);

		const secondOut = waitForOutput(runtime, 'finish', 'value');
		const secondDone = firstValueFrom(
			runtime.runner.events$.pipe(filter(isRuntimeDone)),
		);
		runtime.runner.start();
		expect((await secondOut)[3].value).toBe('v2');
		await secondDone;
	});

	it('drops edges whose port vanished', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createTypedSource({
				nodeId: 'A',
				wireType: 'string',
				value: 'keep',
				extra: { wireType: 'string', value: 'drop-me' },
			}),
		);
		runtime.editor.addNode(
			createTypedSink({ nodeId: 'sink', wireType: 'string' }),
		);
		const extraEdge = runtime.editor.addEdge({
			fromNodeId: asNodeId('A'),
			fromPort: ['extra', 0],
			toNodeId: asNodeId('sink'),
			toPort: ['value', 0],
		});

		expect(extraEdge).not.toBe(false);

		const swapped = runtime.editor.swapNode(
			asNodeId('A'),
			withoutNodeId(
				createTypedSource({
					nodeId: 'A',
					wireType: 'string',
					value: 'keep',
				}),
			),
		);

		expect(swapped).not.toBe(false);
		if (swapped === false) {
			return;
		}

		expect(swapped.droppedEdges).toEqual([extraEdge]);
		expect(runtime.editor.getEdges()).toEqual([]);
	});

	it('drops edges whose wire type became incompatible', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createTypedSource({
				nodeId: 'A',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(
			createTypedSink({ nodeId: 'sink', wireType: 'string' }),
		);
		const wired = runtime.editor.addEdge({
			fromNodeId: asNodeId('A'),
			fromPort: ['value', 0],
			toNodeId: asNodeId('sink'),
			toPort: ['value', 0],
		});

		expect(wired).not.toBe(false);

		const swapped = runtime.editor.swapNode(
			asNodeId('A'),
			withoutNodeId(
				createTypedSource({
					nodeId: 'A',
					wireType: 'number',
					value: 1,
				}),
			),
		);

		expect(swapped).not.toBe(false);
		if (swapped === false) {
			return;
		}

		expect(swapped.droppedEdges).toEqual([wired]);
		expect(runtime.editor.getEdges()).toEqual([]);
	});
});
