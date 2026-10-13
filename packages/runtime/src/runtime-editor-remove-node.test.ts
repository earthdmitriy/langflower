import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { RuntimeEditor } from './runtime-editor.js';
import type { NodeId, PortMeta, RuntimeEdge, RuntimeNode } from './types.js';

const nodeId = (value: string): NodeId => value as NodeId;

const edgeKey = (
	row: Pick<RuntimeEdge, 'fromNodeId' | 'fromPort' | 'toNodeId' | 'toPort'>,
): string =>
	[
		row.fromNodeId,
		row.fromPort.join(':'),
		row.toNodeId,
		row.toPort.join(':'),
	].join('>');

const expectEdges = (
	editor: RuntimeEditor,
	expected: ReadonlyArray<
		Pick<RuntimeEdge, 'fromNodeId' | 'fromPort' | 'toNodeId' | 'toPort'>
	>,
): void => {
	const actual = editor.getEdges().map((row) => ({
		fromNodeId: row.fromNodeId,
		fromPort: row.fromPort,
		toNodeId: row.toNodeId,
		toPort: row.toPort,
	}));
	const byKey = (
		rows: ReadonlyArray<
			Pick<RuntimeEdge, 'fromNodeId' | 'fromPort' | 'toNodeId' | 'toPort'>
		>,
	) => [...rows].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));

	expect(byKey(actual)).toEqual(byKey(expected));
};

const connect = (
	editor: RuntimeEditor,
	fromNodeId: string,
	fromPort: string,
	toNodeId: string,
	toPort: string,
	fromSlot = 0,
	toSlot = 0,
): void => {
	const edge = editor.addEdge({
		fromNodeId: nodeId(fromNodeId),
		fromPort: [fromPort, fromSlot],
		toNodeId: nodeId(toNodeId),
		toPort: [toPort, toSlot],
	});

	expect(edge).not.toBe(false);
};

const sourceNode = (id: string, wireType: string): RuntimeNode => ({
	nodeId: nodeId(id),
	inputs: {},
	outputs: {
		value: statefulObservable({
			loader: () => of(wireType),
			meta: { dir: 'out', portId: 'value', wireType },
		}),
	},
	bypassPorts: {},
});

const sinkNode = (
	id: string,
	wireType: string,
	portId = 'value',
): RuntimeNode => ({
	nodeId: nodeId(id),
	inputs: {
		[portId]: statefulConnection<unknown, unknown, PortMeta>({
			meta: { dir: 'in', portId, wireType, mode: 'single' },
		}),
	},
	outputs: {},
	bypassPorts: {},
});

const passthroughNode = (id: string): RuntimeNode => {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'dynamic',
			mode: 'single',
		},
	});

	return {
		nodeId: nodeId(id),
		inputs: { value: input },
		outputs: {
			value: input.with({
				meta: {
					dir: 'out',
					portId: 'value',
					wireType: 'dynamic',
					fromInput: 'value',
				},
			}),
		},
		bypassPorts: {},
	};
};

/** Preview stand-in: `output` continues `input`; `text` does not. */
const previewLikeNode = (id: string): RuntimeNode => {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'input',
			wireType: 'dynamic',
			mode: 'single',
		},
	});

	return {
		nodeId: nodeId(id),
		inputs: { input },
		outputs: {
			output: input.with({
				meta: {
					dir: 'out',
					portId: 'output',
					wireType: 'dynamic',
					fromInput: 'input',
				},
			}),
			text: statefulObservable({
				loader: () => of(''),
				meta: { dir: 'out', portId: 'text', wireType: 'string' },
			}),
		},
		bypassPorts: {},
	};
};

const reviewGateLikeNode = (id: string): RuntimeNode => ({
	nodeId: nodeId(id),
	inputs: {
		result: statefulConnection<unknown, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'result',
				wireType: 'string',
				mode: 'single',
			},
		}),
	},
	outputs: {
		response: statefulObservable({
			loader: () => of(''),
			meta: {
				dir: 'out',
				portId: 'response',
				wireType: 'string',
				rewireFrom: 'result',
			},
		}),
		feedback: statefulObservable({
			loader: () => of(''),
			meta: { dir: 'out', portId: 'feedback', wireType: 'string' },
		}),
	},
	bypassPorts: {},
});

const llmLikeNode = (id: string): RuntimeNode => ({
	nodeId: nodeId(id),
	inputs: {
		feedback: statefulConnection<unknown, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'feedback',
				wireType: 'string',
				mode: 'single',
			},
		}),
	},
	outputs: {
		response: statefulObservable({
			loader: () => of('draft'),
			meta: { dir: 'out', portId: 'response', wireType: 'string' },
		}),
	},
	bypassPorts: {},
});

/** Static string relay so a cycle can be wired without a dynamic pin. */
const stringRelayNode = (id: string): RuntimeNode => {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'string',
			mode: 'single',
		},
	});

	return {
		nodeId: nodeId(id),
		inputs: { value: input },
		outputs: {
			value: input.with({
				meta: {
					dir: 'out',
					portId: 'value',
					wireType: 'string',
					fromInput: 'value',
				},
			}),
		},
		bypassPorts: {},
	};
};

const mergePassthroughNode = (id: string): RuntimeNode => {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'lines',
			wireType: 'string',
			mode: 'merge',
		},
	});

	return {
		nodeId: nodeId(id),
		inputs: { lines: input },
		outputs: {
			value: input.with({
				meta: {
					dir: 'out',
					portId: 'value',
					wireType: 'dynamic',
					fromInput: 'lines',
				},
			}),
		},
		bypassPorts: {},
	};
};

const stampRewireFrom = (
	editor: RuntimeEditor,
	id: string,
	rewireFrom: string,
): void => {
	const node = editor.getNode(nodeId(id));

	if (node === false) {
		throw new Error(`missing node ${id}`);
	}

	for (const output of Object.values(node.outputs)) {
		Object.assign(output.meta, { rewireFrom });
	}
};

const edge = (
	fromNodeId: string,
	fromPort: string,
	toNodeId: string,
	toPort: string,
	fromSlot = 0,
	toSlot = 0,
): Pick<RuntimeEdge, 'fromNodeId' | 'fromPort' | 'toNodeId' | 'toPort'> => ({
	fromNodeId: nodeId(fromNodeId),
	fromPort: [fromPort, fromSlot],
	toNodeId: nodeId(toNodeId),
	toPort: [toPort, toSlot],
});

describe('RuntimeEditor.removeNode splices', () => {
	it('fans a passthrough output out and drops the text branch', () => {
		const editor = new RuntimeEditor();
		editor.addNode(sourceNode('A', 'string'));
		editor.addNode(previewLikeNode('B'));
		editor.addNode(sinkNode('C', 'any'));
		editor.addNode(sinkNode('D', 'any'));
		editor.addNode(sinkNode('E', 'string'));
		connect(editor, 'A', 'value', 'B', 'input');
		connect(editor, 'B', 'output', 'C', 'value');
		connect(editor, 'B', 'output', 'D', 'value');
		connect(editor, 'B', 'text', 'E', 'value');

		expect(editor.removeNode(nodeId('B'))).not.toBe(false);

		expectEdges(editor, [
			edge('A', 'value', 'C', 'value'),
			edge('A', 'value', 'D', 'value'),
		]);
	});

	it('drops a splice whose downstream port rejects the source type', () => {
		const editor = new RuntimeEditor();
		const input = statefulConnection<unknown, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'value',
				wireType: 'any',
				mode: 'single',
			},
		});
		editor.addNode(sourceNode('A', 'number'));
		editor.addNode({
			nodeId: nodeId('B'),
			inputs: { value: input },
			outputs: {
				value: input.with({
					meta: {
						dir: 'out',
						portId: 'value',
						wireType: 'any',
						rewireFrom: 'value',
					},
				}),
			},
			bypassPorts: {},
		});
		editor.addNode(sinkNode('C', 'string'));
		editor.addNode(sinkNode('D', 'any'));
		connect(editor, 'A', 'value', 'B', 'value');
		connect(editor, 'B', 'value', 'C', 'value');
		connect(editor, 'B', 'value', 'D', 'value');

		editor.removeNode(nodeId('B'));

		expectEdges(editor, [edge('A', 'value', 'D', 'value')]);
	});

	it('splices review response and drops the feedback loop', () => {
		const editor = new RuntimeEditor();
		editor.addNode(llmLikeNode('LLM'));
		editor.addNode(reviewGateLikeNode('gate'));
		editor.addNode(sinkNode('next', 'string'));
		connect(editor, 'LLM', 'response', 'gate', 'result');
		connect(editor, 'gate', 'response', 'next', 'value');
		connect(editor, 'gate', 'feedback', 'LLM', 'feedback');

		editor.removeNode(nodeId('gate'));

		expectEdges(editor, [edge('LLM', 'response', 'next', 'value')]);
	});

	it('leaves a multi-input channel unwired when more than one slot is occupied', () => {
		const editor = new RuntimeEditor();
		editor.addNode(sourceNode('A', 'string'));
		editor.addNode(sourceNode('X', 'string'));
		editor.addNode(mergePassthroughNode('B'));
		editor.addNode(sinkNode('C', 'any'));
		connect(editor, 'A', 'value', 'B', 'lines', 0, 0);
		connect(editor, 'X', 'value', 'B', 'lines', 0, 1);
		connect(editor, 'B', 'value', 'C', 'value');

		editor.removeNode(nodeId('B'));

		expect(editor.getEdges()).toEqual([]);
	});

	it('splices a multi input when only one slot is occupied', () => {
		const editor = new RuntimeEditor();
		editor.addNode(sourceNode('A', 'string'));
		editor.addNode(mergePassthroughNode('B'));
		editor.addNode(sinkNode('C', 'any'));
		connect(editor, 'A', 'value', 'B', 'lines', 0, 0);
		connect(editor, 'B', 'value', 'C', 'value');

		editor.removeNode(nodeId('B'));

		expectEdges(editor, [edge('A', 'value', 'C', 'value')]);
	});

	it('keeps a downstream passthrough wire by splicing before cleanup', () => {
		const editor = new RuntimeEditor();
		editor.addNode(sourceNode('A', 'string'));
		editor.addNode(passthroughNode('B'));
		editor.addNode(passthroughNode('C'));
		editor.addNode(sinkNode('D', 'any'));
		connect(editor, 'A', 'value', 'B', 'value');
		connect(editor, 'B', 'value', 'C', 'value');
		connect(editor, 'C', 'value', 'D', 'value');

		editor.removeNode(nodeId('B'));

		expectEdges(editor, [
			edge('A', 'value', 'C', 'value'),
			edge('C', 'value', 'D', 'value'),
		]);
	});

	it('collapses a deleted chain one node at a time', () => {
		const editor = new RuntimeEditor();
		editor.addNode(sourceNode('A', 'string'));
		editor.addNode(passthroughNode('B'));
		editor.addNode(passthroughNode('C'));
		editor.addNode(sinkNode('D', 'any'));
		connect(editor, 'A', 'value', 'B', 'value');
		connect(editor, 'B', 'value', 'C', 'value');
		connect(editor, 'C', 'value', 'D', 'value');

		editor.removeNode(nodeId('B'));
		editor.removeNode(nodeId('C'));

		expectEdges(editor, [edge('A', 'value', 'D', 'value')]);
	});

	it('skips a splice that would connect a node to itself', () => {
		const editor = new RuntimeEditor();
		editor.addNode(stringRelayNode('A'));
		editor.addNode(stringRelayNode('B'));
		connect(editor, 'A', 'value', 'B', 'value');
		connect(editor, 'B', 'value', 'A', 'value');

		editor.removeNode(nodeId('B'));

		expect(editor.getEdges()).toEqual([]);
	});

	it('does not splice while the editor is locked', () => {
		const editor = new RuntimeEditor();
		editor.addNode(sourceNode('A', 'string'));
		editor.addNode(passthroughNode('B'));
		editor.addNode(sinkNode('C', 'any'));
		connect(editor, 'A', 'value', 'B', 'value');
		connect(editor, 'B', 'value', 'C', 'value');
		editor.setLocked(true);

		expect(editor.removeNode(nodeId('B'))).toBe(false);
		expectEdges(editor, [
			edge('A', 'value', 'B', 'value'),
			edge('B', 'value', 'C', 'value'),
		]);
	});

	it('pairs bypass slots and drops an outgoing slot with no incoming pair', () => {
		const editor = new RuntimeEditor();
		editor.addNode(sourceNode('S0', 'any'));
		editor.addNode(sourceNode('S1', 'any'));
		editor.addNode({
			nodeId: nodeId('R'),
			inputs: {},
			outputs: {},
			bypassPorts: { ch: 'any' as RuntimeNode['bypassPorts'][string] },
		});
		editor.addNode(sinkNode('T0', 'any'));
		editor.addNode(sinkNode('T1', 'any'));
		connect(editor, 'S0', 'value', 'R', 'ch', 0, 0);
		connect(editor, 'S1', 'value', 'R', 'ch', 0, 1);
		connect(editor, 'R', 'ch', 'T0', 'value', 0, 0);
		stampRewireFrom(editor, 'R', 'ch');

		editor.removeNode(nodeId('R'));

		expectEdges(editor, [edge('S0', 'value', 'T0', 'value')]);
	});

	it('does not splice a bypass port that declares no continuation', () => {
		const editor = new RuntimeEditor();
		editor.addNode(sourceNode('S0', 'any'));
		editor.addNode({
			nodeId: nodeId('R'),
			inputs: {},
			outputs: {},
			bypassPorts: { ch: 'any' as RuntimeNode['bypassPorts'][string] },
		});
		editor.addNode(sinkNode('T0', 'any'));
		connect(editor, 'S0', 'value', 'R', 'ch');
		connect(editor, 'R', 'ch', 'T0', 'value');

		editor.removeNode(nodeId('R'));

		expect(editor.getEdges()).toEqual([]);
	});
});
