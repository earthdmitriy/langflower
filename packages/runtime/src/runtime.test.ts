import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { filter, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { PortMeta } from './port-meta.js';
import { readOutputValue } from './testing/readOutputValue.js';
import { createConstantTestNode } from './testing/nodes/constant-node.js';
import { createDelayTestNode } from './testing/nodes/delay-node.js';
import { createFinishTestNode } from './testing/nodes/finish-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	edgeIdsFromPortEvent,
	portDirLabel,
	runAndCollectEvents,
	waitForOutput,
} from './testing/workflows/workflow-events.js';
import { isPortTelemetry, isRuntimeDone, type PortTelemetry } from './types.js';

function createTypedSourceTestNode(options: {
	readonly nodeId: string;
	readonly wireType: string;
	readonly value: unknown;
}): RuntimeNode {
	const { nodeId, wireType, value } = options;
	const output = statefulObservable({
		loader: () => of(value),
		meta: { dir: 'out', portId: 'value', wireType },
	});

	return {
		nodeId,
		inputs: {},
		outputs: { value: output },
		bypassPorts: {},
	};
}

function createTypedSinkTestNode(options: {
	readonly nodeId: string;
	readonly wireType: string;
	readonly mode?: 'single' | 'merge';
}): RuntimeNode {
	const { nodeId, wireType, mode = 'single' } = options;
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: { dir: 'in', portId: 'value', wireType, mode },
	});

	return {
		nodeId,
		inputs: { value: input },
		outputs: {},
		bypassPorts: {},
	};
}

function createDynamicPassthroughTestNode(nodeId: string): RuntimeNode {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'dynamic',
			mode: 'single',
		},
	});
	const output = input.with({
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'dynamic',
			fromInput: 'value',
		},
	});

	return {
		nodeId,
		inputs: { value: input },
		outputs: { value: output },
		bypassPorts: {},
	};
}

function createStaticTypedPassthroughTestNode(nodeId: string): RuntimeNode {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'text',
			wireType: 'string',
			mode: 'single',
		},
	});
	const output = input.with({
		meta: {
			dir: 'out',
			portId: 'text',
			wireType: 'dynamic',
			fromInput: 'text',
		},
	});

	return {
		nodeId,
		inputs: { text: input },
		outputs: { text: output },
		bypassPorts: {},
	};
}

describe('Runtime (v2)', () => {
	it('wires output → input via connect on start', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'A',
				fromPort: ['value', 0],
				toNodeId: 'B',
				toPort: ['value', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'A',
				toNodeId: 'B',
			}),
		);

		const runId = runtime.runner.start();
		expect(runId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);

		expect(
			await readOutputValue(runtime.editor.getNode('B').outputs.value),
		).toBe('hello');
	});

	it('stays running for acyclic graphs without a finish node', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});

		runtime.runner.start();

		expect(
			await readOutputValue(runtime.editor.getNode('B').outputs.value),
		).toBe('hello');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('running');

		runtime.runner.interrupt('cancel');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('stopped');
	});

	it('emits done when a stopsRun finish node receives a value', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));
		runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const donePromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event): event is readonly ['done', string] =>
						isRuntimeDone(event) && event.length === 2,
				),
			),
		);

		const runId = runtime.runner.start();
		const done = await donePromise;

		expect(done[1]).toBe(runId);
		expect(await firstValueFrom(runtime.runner.status$)).toBe('idle');
	});

	it('disconnects input connections on interrupt', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});

		runtime.runner.start();
		runtime.runner.interrupt('cancel');

		expect(await firstValueFrom(runtime.runner.status$)).toBe('stopped');
	});

	it('seeds open input slots with connect(of(value))', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);

		runtime.runner.start({
			B: [{ portId: 'value', slotIndex: 0, value: 'seeded' }],
		});

		expect(
			await readOutputValue(runtime.editor.getNode('B').outputs.value),
		).toBe('seeded');
	});

	it('pushIntoInput starts the target cluster and delivers payload', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);

		const outputPromise = waitForOutput(runtime, 'B', 'value');
		const runId = runtime.runner.pushIntoInput({
			nodeId: 'B',
			portId: 'value',
			payload: 'pushed',
		});

		if (runId === false) {
			throw new Error('Expected pushIntoInput to start a run');
		}

		const output = await outputPromise;

		expect(output[4]).toBe('pushed');
		expect(edgeIdsFromPortEvent(output)).toEqual([]);
		expect(await firstValueFrom(runtime.runner.status$)).toBe('running');
	});

	it('pushIntoInput reuses the active run for repeated pushes', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);

		const firstOutputPromise = waitForOutput(runtime, 'B', 'value');
		const runId = runtime.runner.pushIntoInput({
			nodeId: 'B',
			portId: 'value',
			payload: 'first',
		});

		if (runId === false) {
			throw new Error('Expected pushIntoInput to start a run');
		}

		expect((await firstOutputPromise)[4]).toBe('first');

		const secondOutputPromise = waitForOutput(runtime, 'B', 'value', runId);
		const activeRunId = runtime.runner.pushIntoInput({
			nodeId: 'B',
			portId: 'value',
			payload: 'second',
		});

		expect(activeRunId).toBe(runId);
		expect((await secondOutputPromise)[4]).toBe('second');
	});

	it('pushIntoInput starts a new scoped run after interrupt', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);

		const firstOutputPromise = waitForOutput(runtime, 'B', 'value');
		const firstRunId = runtime.runner.pushIntoInput({
			nodeId: 'B',
			portId: 'value',
			payload: 'before interrupt',
		});

		if (firstRunId === false) {
			throw new Error('Expected pushIntoInput to start the first run');
		}

		await firstOutputPromise;
		runtime.runner.interrupt('cancel');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('stopped');

		const secondOutputPromise = waitForOutput(runtime, 'B', 'value');
		const secondRunId = runtime.runner.pushIntoInput({
			nodeId: 'B',
			portId: 'value',
			payload: 'after interrupt',
		});

		if (secondRunId === false) {
			throw new Error('Expected pushIntoInput to start the second run');
		}

		const output = await secondOutputPromise;

		expect(secondRunId).not.toBe(firstRunId);
		expect(output[4]).toBe('after interrupt');
	});

	it('pushIntoInput delivers pause to single-mode steerControl during a run (ADR-032)', async () => {
		const runtime = createRuntimeHarness();
		const valueIn = statefulConnection<unknown, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'value',
				wireType: 'any',
				mode: 'single',
			},
		});
		const steerIn = statefulConnection<unknown, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'steerControl',
				wireType: 'any',
				mode: 'single',
			},
		});
		const output = statefulObservable({
			input: valueIn.value$,
			loader: (inputValue) => of(inputValue),
			meta: { dir: 'out', portId: 'value', wireType: 'any' },
		});
		runtime.editor.addNode({
			nodeId: 'helper',
			inputs: { value: valueIn, steerControl: steerIn },
			outputs: { value: output },
			bypassPorts: {},
			emitOncePerActivation: true,
		});

		const outputPromise = waitForOutput(runtime, 'helper', 'value');
		const runId = runtime.runner.pushIntoInput({
			nodeId: 'helper',
			portId: 'value',
			payload: 'running',
		});
		if (runId === false) {
			throw new Error('Expected pushIntoInput to start a run');
		}
		expect((await outputPromise)[4]).toBe('running');
		expect(runtime.runner.status).toBe('running');

		const pauseReceived = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						isPortTelemetry(event) &&
						event[0] === 'in' &&
						event[1] === 'helper' &&
						event[2] === 'steerControl' &&
						event[3] === 'value',
				),
			),
		);
		const pauseRunId = runtime.runner.pushIntoInput({
			nodeId: 'helper',
			portId: 'steerControl',
			payload: { kind: 'pause' },
		});

		expect(pauseRunId).toBe(runId);
		const event = await pauseReceived;
		expect(isPortTelemetry(event) && event[0] === 'in' && event[4]).toEqual({
			kind: 'pause',
		});
	});

	it('pushIntoInput logs input-received before output-emitted (first and repeat)', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'gate', delayMs: 0 }),
		);

		const events: { kind: string; nodeId: string; portId: string }[] = [];
		const subscription = runtime.runner.events$.subscribe((event) => {
			if (
				isPortTelemetry(event) &&
				event[3] === 'value' &&
				event[1] === 'gate' &&
				event[2] === 'value'
			) {
				events.push({
					kind: portDirLabel(event),
					nodeId: String(event[1]),
					portId: String(event[2]),
				});
			}
		});

		const firstOut = waitForOutput(runtime, 'gate', 'value');
		const runId = runtime.runner.pushIntoInput({
			nodeId: 'gate',
			portId: 'value',
			payload: 'first',
		});
		if (runId === false) {
			subscription.unsubscribe();
			throw new Error('Expected pushIntoInput to start a run');
		}
		await firstOut;

		expect(events.map((event) => event.kind)).toEqual([
			'input-received',
			'output-emitted',
		]);

		events.length = 0;
		const secondOut = waitForOutput(runtime, 'gate', 'value', runId);
		expect(
			runtime.runner.pushIntoInput({
				nodeId: 'gate',
				portId: 'value',
				payload: 'second',
			}),
		).toBe(runId);
		await secondOut;

		expect(events.map((event) => event.kind)).toEqual([
			'input-received',
			'output-emitted',
		]);

		subscription.unsubscribe();
	});

	it('pushIntoInput rejects missing, multi, and edge-occupied inputs', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'wired' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		runtime.editor.addNode(
			createTypedSinkTestNode({
				nodeId: 'multi',
				wireType: 'any',
				mode: 'merge',
			}),
		);
		runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});

		expect(
			runtime.runner.pushIntoInput({
				nodeId: 'missing',
				portId: 'value',
				payload: 'x',
			}),
		).toBe(false);
		expect(
			runtime.runner.pushIntoInput({
				nodeId: 'B',
				portId: 'missing',
				payload: 'x',
			}),
		).toBe(false);
		expect(
			runtime.runner.pushIntoInput({
				nodeId: 'multi',
				portId: 'value',
				payload: 'x',
			}),
		).toBe(false);
		expect(
			runtime.runner.pushIntoInput({
				nodeId: 'B',
				portId: 'value',
				payload: 'x',
			}),
		).toBe(false);
		expect(await firstValueFrom(runtime.runner.status$)).toBe('idle');
	});

	it('rejects editor mutations while running', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: '1' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		const edge = runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});
		expect(edge).not.toBe(false);

		runtime.runner.start();

		expect(
			runtime.editor.addNode(
				createConstantTestNode({ nodeId: 'C', value: '2' }),
			),
		).toBe(false);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'A',
				fromPort: ['value', 0],
				toNodeId: 'B',
				toPort: ['value', 0],
			}),
		).toBe(false);
		expect(runtime.editor.removeNode('B')).toBe(false);
		expect(
			runtime.editor.removeEdge(edge === false ? 'missing' : edge.edgeId),
		).toEqual([]);
	});

	it('startNode runs the cluster containing the node and ignores other clusters', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'upstream' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'C', delayMs: 0 }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'O', value: 'orphan' }),
		);

		runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});
		runtime.editor.addEdge({
			fromNodeId: 'B',
			fromPort: ['value', 0],
			toNodeId: 'C',
			toPort: ['value', 0],
		});

		const orphanEvents: unknown[] = [];
		const subscription = runtime.runner.events$.subscribe((event) => {
			if (isPortTelemetry(event) && event[0] === 'out' && event[1] === 'O') {
				orphanEvents.push(event);
			}
		});

		const runId = runtime.runner.startNode('B');
		const output = await waitForOutput(runtime, 'C', 'value', runId);

		subscription.unsubscribe();

		expect(output[4]).toBe('upstream');
		expect(orphanEvents).toEqual([]);
	});

	it('events$ does not replay past events to late subscribers', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);

		runtime.runner.start();

		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		const lateEvents: unknown[] = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			lateEvents.push(event);
		});

		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		sub.unsubscribe();
		expect(lateEvents).toEqual([]);
	});

	it('eventLog stays empty unless constructed with log: true', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);

		runtime.runner.start();

		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});

		expect(runtime.runner.eventLog).toEqual([]);
	});

	it('eventLog records all events when log: true', async () => {
		const runtime = createRuntimeHarness({ log: true });
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});

		const runId = runtime.runner.start();

		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});

		expect(runtime.runner.eventLog.length).toBeGreaterThan(0);
		expect(
			runtime.runner.eventLog.some(
				(event) =>
					isPortTelemetry(event) &&
					event[0] === 'out' &&
					event[1] === 'B',
			),
		).toBe(true);
	});

	it('clearEventLog drops recorded events and is a no-op without log: true', async () => {
		const runtime = createRuntimeHarness({ log: true });
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});

		runtime.runner.start();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(runtime.runner.eventLog.length).toBeGreaterThan(0);

		runtime.runner.clearEventLog();
		expect(runtime.runner.eventLog).toEqual([]);

		const noLog = createRuntimeHarness();
		expect(() => noLog.runner.clearEventLog()).not.toThrow();
	});

	it('edgeIds on output-emitted and input-received events', async () => {
		const runtime = createRuntimeHarness({ log: true });
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		const edge = runtime.editor.addEdge({
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});

		const { runId, events } = await runAndCollectEvents(runtime, () =>
			runtime.runner.start(),
		);

		const outputEvents = events.filter(
			(e): e is PortTelemetry =>
				isPortTelemetry(e) && e[0] === 'out' && e[1] === 'A',
		);
		const inputEvents = events.filter(
			(e): e is PortTelemetry =>
				isPortTelemetry(e) && e[0] === 'in' && e[1] === 'B',
		);

		expect(outputEvents.length).toBeGreaterThan(0);
		expect(inputEvents.length).toBeGreaterThan(0);
		expect(edgeIdsFromPortEvent(outputEvents[0]!)).toEqual([edge!.edgeId]);
		expect(edgeIdsFromPortEvent(inputEvents[0]!)).toEqual([edge!.edgeId]);
	});

	it('edgeIds is empty array for seeds', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);

		const outputPromise = waitForOutput(runtime, 'B', 'value');
		runtime.runner.start({
			B: [{ portId: 'value', slotIndex: 0, value: 'seeded' }],
		});

		const output = await outputPromise;

		expect(edgeIdsFromPortEvent(output)).toEqual([]);
	});

	it('rejects static output connected to mismatched static input', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'source',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(
			createTypedSinkTestNode({
				nodeId: 'sink',
				wireType: 'number',
			}),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'source',
				fromPort: ['value', 0],
				toNodeId: 'sink',
				toPort: ['value', 0],
			}),
		).toBe(false);
	});

	it('allows static output connected to dynamic single input', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'source',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(
			createTypedSinkTestNode({
				nodeId: 'sink',
				wireType: 'dynamic',
			}),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'source',
				fromPort: ['value', 0],
				toNodeId: 'sink',
				toPort: ['value', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'source',
				toNodeId: 'sink',
			}),
		);
	});

	it('pins dynamic multi input to the first connected effective type', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'text',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'count',
				wireType: 'number',
				value: 1,
			}),
		);
		runtime.editor.addNode(
			createTypedSinkTestNode({
				nodeId: 'sink',
				wireType: 'dynamic',
				mode: 'merge',
			}),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'text',
				fromPort: ['value', 0],
				toNodeId: 'sink',
				toPort: ['value', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'text',
				toNodeId: 'sink',
			}),
		);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'count',
				fromPort: ['value', 0],
				toNodeId: 'sink',
				toPort: ['value', 1],
			}),
		).toBe(false);

		const [edge] = runtime.editor.getEdges();
		expect(runtime.editor.removeEdge(edge.edgeId)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ nodeId: 'text' }),
				expect.objectContaining({ nodeId: 'sink' }),
			]),
		);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'count',
				fromPort: ['value', 0],
				toNodeId: 'sink',
				toPort: ['value', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'count',
				toNodeId: 'sink',
			}),
		);
	});

	it('uses dynamic output source input effective type', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'source',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(createDynamicPassthroughTestNode('passthrough'));
		runtime.editor.addNode(
			createTypedSinkTestNode({
				nodeId: 'sink',
				wireType: 'string',
			}),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'source',
				fromPort: ['value', 0],
				toNodeId: 'passthrough',
				toPort: ['value', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'source',
				toNodeId: 'passthrough',
			}),
		);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'passthrough',
				fromPort: ['value', 0],
				toNodeId: 'sink',
				toPort: ['value', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'passthrough',
				toNodeId: 'sink',
			}),
		);
	});

	it('rejects dynamic output without source input connection', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(createDynamicPassthroughTestNode('passthrough'));
		runtime.editor.addNode(
			createTypedSinkTestNode({
				nodeId: 'sink',
				wireType: 'string',
			}),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'passthrough',
				fromPort: ['value', 0],
				toNodeId: 'sink',
				toPort: ['value', 0],
			}),
		).toBe(false);
	});

	it('accepts passthrough outbound edge before inbound when input wire type is static', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(createStaticTypedPassthroughTestNode('preview'));
		runtime.editor.addNode(
			createTypedSinkTestNode({
				nodeId: 'finish',
				wireType: 'any',
			}),
		);
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'delay',
				wireType: 'any',
				value: 'hello',
			}),
		);

		expect(
			runtime.editor.addEdge({
				fromNodeId: 'preview',
				fromPort: ['text', 0],
				toNodeId: 'finish',
				toPort: ['value', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'preview',
				toNodeId: 'finish',
			}),
		);
		expect(
			runtime.editor.addEdge({
				fromNodeId: 'delay',
				fromPort: ['value', 0],
				toNodeId: 'preview',
				toPort: ['text', 0],
			}),
		).toEqual(
			expect.objectContaining({
				fromNodeId: 'delay',
				toNodeId: 'preview',
			}),
		);
	});

	it('replaceEdge preserves downstream dynamic passthrough wire', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'source-a',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'source-b',
				wireType: 'string',
				value: 'world',
			}),
		);
		runtime.editor.addNode(createDynamicPassthroughTestNode('passthrough'));
		runtime.editor.addNode(
			createTypedSinkTestNode({
				nodeId: 'sink',
				wireType: 'string',
			}),
		);

		const incoming = runtime.editor.addEdge({
			fromNodeId: 'source-a',
			fromPort: ['value', 0],
			toNodeId: 'passthrough',
			toPort: ['value', 0],
		});
		const downstream = runtime.editor.addEdge({
			fromNodeId: 'passthrough',
			fromPort: ['value', 0],
			toNodeId: 'sink',
			toPort: ['value', 0],
		});

		expect(incoming).not.toBe(false);
		expect(downstream).not.toBe(false);

		const replaced = runtime.editor.replaceEdge({
			fromNodeId: 'source-b',
			fromPort: ['value', 0],
			toNodeId: 'passthrough',
			toPort: ['value', 0],
		});

		expect(replaced).toEqual(incoming);
		expect(runtime.editor.getEdges()).toHaveLength(2);
		expect(
			runtime.editor
				.getEdges()
				.some((edge) => edge.edgeId === downstream!.edgeId),
		).toBe(true);
		expect(
			runtime.editor
				.getEdges()
				.some(
					(edge) =>
						edge.fromNodeId === 'source-b' &&
						edge.toNodeId === 'passthrough',
				),
		).toBe(true);
	});

	it('replaceEdge returns false when target port is free', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'source',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(createDynamicPassthroughTestNode('passthrough'));

		expect(
			runtime.editor.replaceEdge({
				fromNodeId: 'source',
				fromPort: ['value', 0],
				toNodeId: 'passthrough',
				toPort: ['value', 0],
			}),
		).toBe(false);
	});

	it('addEdge accepts persisted edge id during bind', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createTypedSourceTestNode({
				nodeId: 'source',
				wireType: 'string',
				value: 'hello',
			}),
		);
		runtime.editor.addNode(createDynamicPassthroughTestNode('passthrough'));

		expect(
			runtime.editor.addEdge(
				{
					fromNodeId: 'source',
					fromPort: ['value', 0],
					toNodeId: 'passthrough',
					toPort: ['value', 0],
				},
				{ edgeId: 'persisted-edge-id' },
			),
		).toEqual(
			expect.objectContaining({
				edgeId: 'persisted-edge-id',
			}),
		);
	});
});
