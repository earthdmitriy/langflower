import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
	createRuntimeHarness,
	runAndCollectEvents,
} from './testing/workflows/workflow-events.js';
import {
	isPortTelemetry,
	type NodeId,
	type PortMeta,
	type RuntimeFeedPortMeta,
	type RuntimeNode,
} from './types.js';

const feedResult: RuntimeFeedPortMeta = { role: 'result' };
const feedDraft: RuntimeFeedPortMeta = { role: 'draft', streaming: true };

const createSource = (options: {
	readonly nodeId: string;
	readonly value?: unknown;
	readonly feed?: RuntimeFeedPortMeta;
	readonly error?: boolean;
	readonly feedVisitBoundary?: boolean;
}): RuntimeNode => {
	const output = statefulObservable({
		loader: () =>
			options.error === true
				? throwError(() => new Error('boom'))
				: of(options.value ?? 'hello'),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
			...(options.feed !== undefined ? { feed: options.feed } : {}),
		} satisfies PortMeta,
	});
	return {
		nodeId: options.nodeId as NodeId,
		inputs: {},
		outputs: { value: output },
		bypassPorts: {},
		...(options.feedVisitBoundary === true
			? { feedVisitBoundary: true }
			: {}),
	};
};

const createSink = (options: {
	readonly nodeId: string;
	readonly feed?: RuntimeFeedPortMeta;
	readonly mode?: 'single' | 'merge' | 'combine' | 'zip';
	readonly defaultValue?: unknown;
	readonly feedVisitBoundary?: boolean;
}): RuntimeNode => {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: options.mode ?? 'single',
			...(options.feed !== undefined ? { feed: options.feed } : {}),
			...(options.defaultValue !== undefined
				? { defaultValue: options.defaultValue }
				: {}),
		} satisfies PortMeta,
	});
	const output = input.with({
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
			fromInput: 'value',
		} satisfies PortMeta,
	});
	return {
		nodeId: options.nodeId as NodeId,
		inputs: { value: input },
		outputs: { value: output },
		bypassPorts: {},
		...(options.feedVisitBoundary === true
			? { feedVisitBoundary: true }
			: {}),
	};
};

const inputFeeds = (
	events: readonly {
		readonly 0?: unknown;
		readonly 1?: unknown;
		readonly 3?: unknown;
		readonly 6?: unknown;
	}[],
	nodeId: string,
): readonly unknown[] =>
	events
		.filter(
			(event) =>
				isPortTelemetry(event) &&
				event[0] === 'in' &&
				event[1] === nodeId &&
				event[2] === 'value' &&
				'value' in event[3],
		)
		.map((event) => event[6]);

const outputFeeds = (
	events: readonly {
		readonly 0?: unknown;
		readonly 1?: unknown;
		readonly 3?: unknown;
		readonly 6?: unknown;
	}[],
	nodeId: string,
): readonly unknown[] =>
	events
		.filter(
			(event) =>
				isPortTelemetry(event) &&
				event[0] === 'out' &&
				event[1] === nodeId &&
				event[2] === 'value' &&
				'value' in event[3],
		)
		.map((event) => event[6]);

describe('port feed meta (target input + visit boundary)', () => {
	it.each([
		{
			name: 'edge-driven input',
			setup: () => {
				const runtime = createRuntimeHarness();
				runtime.editor.addNode(
					createSource({ nodeId: 'src', feed: feedDraft }),
				);
				runtime.editor.addNode(
					createSink({ nodeId: 'sink', feed: feedResult }),
				);
				runtime.editor.addEdge({
					fromNodeId: 'src',
					fromPort: ['value', 0],
					toNodeId: 'sink',
					toPort: ['value', 0],
				});
				return runtime;
			},
		},
		{
			name: 'seed',
			setup: () => {
				const runtime = createRuntimeHarness();
				runtime.editor.addNode(
					createSink({ nodeId: 'sink', feed: feedResult }),
				);
				return runtime;
			},
			start: (runtime: ReturnType<typeof createRuntimeHarness>) => {
				const runId = runtime.runner.start({
					sink: [{ portId: 'value', slotIndex: 0, value: 'seeded' }],
				});
				if (runId === false) {
					throw new Error('start failed');
				}
				return runId;
			},
		},
		{
			name: 'port default',
			setup: () => {
				const runtime = createRuntimeHarness();
				runtime.editor.addNode(
					createSink({
						nodeId: 'sink',
						feed: feedResult,
						defaultValue: 'fallback',
					}),
				);
				return runtime;
			},
		},
	] as const)('stamps target feed on $name', async ({ setup, start }) => {
		const runtime = setup();
		const { events } = await runAndCollectEvents(runtime, () =>
			start !== undefined
				? start(runtime)
				: (() => {
						const runId = runtime.runner.start();
						if (runId === false) {
							throw new Error('start failed');
						}
						return runId;
					})(),
		);
		expect(inputFeeds(events, 'sink')).toEqual([feedResult]);
	});

	it.each(['combine', 'zip', 'merge'] as const)(
		'stamps target feed on %s fan-in from connection meta',
		async (mode) => {
			const runtime = createRuntimeHarness();
			runtime.editor.addNode(createSource({ nodeId: 'a', value: 'A' }));
			runtime.editor.addNode(createSource({ nodeId: 'b', value: 'B' }));
			runtime.editor.addNode(
				createSink({ nodeId: 'sink', feed: feedResult, mode }),
			);
			runtime.editor.addEdge({
				fromNodeId: 'a',
				fromPort: ['value', 0],
				toNodeId: 'sink',
				toPort: ['value', 0],
			});
			runtime.editor.addEdge({
				fromNodeId: 'b',
				fromPort: ['value', 0],
				toNodeId: 'sink',
				toPort: ['value', 1],
			});
			const { events } = await runAndCollectEvents(runtime, () => {
				const runId = runtime.runner.start();
				if (runId === false) {
					throw new Error('start failed');
				}
				return runId;
			});
			const feeds = inputFeeds(events, 'sink');
			expect(feeds.length).toBeGreaterThan(0);
			expect(feeds.every((feed) => feed === feedResult)).toBe(true);
		},
	);

	it('stamps target feed on pushIntoInput', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSink({ nodeId: 'sink', feed: feedResult }),
		);
		const { events } = await runAndCollectEvents(runtime, () => {
			const runId = runtime.runner.pushIntoInput({
				nodeId: 'sink',
				portId: 'value',
				payload: 'pushed',
			});
			if (runId === false) {
				throw new Error('pushIntoInput failed');
			}
			return runId;
		});
		expect(inputFeeds(events, 'sink')).toEqual([feedResult]);
	});

	it('does not leak the producer role onto an unmarked consumer', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSource({ nodeId: 'src', feed: feedDraft }),
		);
		runtime.editor.addNode(createSink({ nodeId: 'sink' }));
		runtime.editor.addEdge({
			fromNodeId: 'src',
			fromPort: ['value', 0],
			toNodeId: 'sink',
			toPort: ['value', 0],
		});
		const { events } = await runAndCollectEvents(runtime, () => {
			const runId = runtime.runner.start();
			if (runId === false) {
				throw new Error('start failed');
			}
			return runId;
		});
		expect(inputFeeds(events, 'sink')).toEqual([null]);
		expect(outputFeeds(events, 'src')).toEqual([feedDraft]);
	});

	it('stamps closesPreviousVisit on every boundary-node frame including a role-less error', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSource({
				nodeId: 'boundary',
				error: true,
				feedVisitBoundary: true,
			}),
		);
		const { events } = await runAndCollectEvents(runtime, () => {
			const runId = runtime.runner.start();
			if (runId === false) {
				throw new Error('start failed');
			}
			return runId;
		});
		const frames = events.filter(
			(event) => isPortTelemetry(event) && event[1] === 'boundary',
		);
		expect(frames.length).toBeGreaterThan(0);
		expect(
			frames.every((event) => event[6]?.closesPreviousVisit === true),
		).toBe(true);
		expect(
			frames.some(
				(event) =>
					'error' in event[3] &&
					event[6]?.role === undefined &&
					event[6]?.closesPreviousVisit === true,
			),
		).toBe(true);
	});

	it('does not stamp closesPreviousVisit on a non-boundary node', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createSource({ nodeId: 'src', feed: feedResult }),
		);
		const { events } = await runAndCollectEvents(runtime, () => {
			const runId = runtime.runner.start();
			if (runId === false) {
				throw new Error('start failed');
			}
			return runId;
		});
		expect(
			outputFeeds(events, 'src').every(
				(feed) =>
					feed !== null &&
					typeof feed === 'object' &&
					'role' in feed &&
					feed.role === 'result' &&
					!('closesPreviousVisit' in feed),
			),
		).toBe(true);
		expect(outputFeeds(events, 'src').length).toBeGreaterThan(0);
	});
});
