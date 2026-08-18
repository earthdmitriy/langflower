import { statefulObservable } from '@rx-evo/stateful-observable';
import { filter, firstValueFrom, of, take, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { NodeId, PortMeta, RunId, RuntimeNode } from './types.js';
import { isPortTelemetry } from './types.js';
import { createConstantTestNode } from './testing/nodes/constant-node.js';
import {
	createDelayTestNode,
	createWiredDelayTestNode,
} from './testing/nodes/delay-node.js';
import { createFinishTestNode } from './testing/nodes/finish-node.js';
import { createJoinTestNode } from './testing/nodes/join-node.js';
import { createMergeTestNode } from './testing/nodes/merge-node.js';
import { createRouterTestNode } from './testing/nodes/router-node.js';
import {
	createRuntimeHarness,
	waitForOutput,
	wireEdge,
} from './testing/workflows/workflow-events.js';

const createLiteralSourceNode = (
	nodeId: string,
	value: unknown,
): RuntimeNode => {
	const output = statefulObservable({
		loader: () => of(value),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: typeof value === 'number' ? 'number' : 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: {},
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
};

describe('RuntimeRunner.resume', () => {
	it('skips completed upstream and finishes from snapshot', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'stage-a' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'stage-a', delayMs: 5 }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'stage-b', delayMs: 5 }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wireEdge(runtime.editor, {
			fromNodeId: 'src',
			fromPort: ['value', 0],
			toNodeId: 'stage-a',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'stage-a',
			fromPort: ['value', 0],
			toNodeId: 'stage-b',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'stage-b',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const firstRunId = runtime.runner.start() as RunId;
		await waitForOutput(runtime, 'stage-a', 'value', firstRunId);
		runtime.runner.interrupt('cancel');

		const stageAEmissions: unknown[] = [];
		const sub = runtime.runner.events$.subscribe((event) => {
			if (
				isPortTelemetry(event) &&
				event[0] === 'out' &&
				event[1] === ('stage-a' as NodeId) &&
				'value' in event[3]
			) {
				stageAEmissions.push(event[3].value);
			}
		});

		const resumeRunId = runtime.runner.resume({
			runId: firstRunId,
			completedNodeIds: ['src' as NodeId, 'stage-a' as NodeId],
			outputSnapshots: {
				src: { value: 'stage-a' },
				'stage-a': { value: 'stage-a' },
			},
		});

		expect(resumeRunId).toBe(firstRunId);
		const terminal = await waitForOutput(
			runtime,
			'stage-b',
			'value',
			firstRunId,
		);
		expect(terminal[3].value).toBe('stage-a');
		expect(stageAEmissions).toEqual(['stage-a']);
		sub.unsubscribe();
	});

	it('throws when a completed edge source lacks a snapshot', () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'x' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'd1', delayMs: 1 }),
		);
		wireEdge(runtime.editor, {
			fromNodeId: 'src',
			fromPort: ['value', 0],
			toNodeId: 'd1',
			toPort: ['value', 0],
		});

		expect(() =>
			runtime.runner.resume({
				completedNodeIds: ['src' as NodeId],
				outputSnapshots: {},
			}),
		).toThrow(/missing output snapshot/i);
	});

	/**
	 * Regression for BUG-2026-07-20: checkpoint keys `ch` / `ch@1` must not all
	 * resume from the base port snapshot.
	 */
	it('replays distinct router bypass slot snapshots into wired Delay.delay', async () => {
		const delayMs = 80;
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(createLiteralSourceNode('value-src', 'hello'));
		runtime.editor.addNode(
			createLiteralSourceNode('delay-ms-src', delayMs),
		);
		runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
		runtime.editor.addNode(createWiredDelayTestNode({ nodeId: 'delay' }));
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wireEdge(runtime.editor, {
			fromNodeId: 'value-src',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'delay-ms-src',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 1],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 0],
			toNodeId: 'delay',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 1],
			toNodeId: 'delay',
			toPort: ['delay', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'delay',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const delayPortInput$ = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						isPortTelemetry(event) &&
						event[0] === 'in' &&
						event[1] === ('delay' as NodeId) &&
						event[2] === 'delay' &&
						'value' in event[3],
				),
			),
		);

		const startedAt = Date.now();
		const resumeRunId = runtime.runner.resume({
			runId: 'resume-router-delay' as RunId,
			completedNodeIds: [
				'value-src' as NodeId,
				'delay-ms-src' as NodeId,
				'router' as NodeId,
			],
			// Checkpoint shape from RunCheckpointSession / demo example.json
			outputSnapshots: {
				'value-src': { value: 'hello' },
				'delay-ms-src': { value: delayMs },
				router: {
					ch: 'hello',
					'ch@1': delayMs,
				},
			},
		});

		expect(resumeRunId).toBe('resume-router-delay');

		const delayPortInput = await delayPortInput$;
		expect(delayPortInput[3].value).toBe(delayMs);

		const delayed = await waitForOutput(
			runtime,
			'delay',
			'value',
			resumeRunId,
		);
		expect(delayed[3].value).toBe('hello');
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(delayMs - 15);
	});

	it('replays completed sources into merge multi-input slots', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'a', value: 'foo' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'b', value: 'bar' }),
		);
		runtime.editor.addNode(createMergeTestNode({ nodeId: 'merge' }));

		wireEdge(runtime.editor, {
			fromNodeId: 'a',
			fromPort: ['value', 0],
			toNodeId: 'merge',
			toPort: ['values', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'b',
			fromPort: ['value', 0],
			toNodeId: 'merge',
			toPort: ['values', 1],
		});

		const mergeEmissions$ = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						isPortTelemetry(event) &&
						event[0] === 'out' &&
						event[1] === ('merge' as NodeId) &&
						event[2] === 'value' &&
						'value' in event[3],
				),
				take(2),
				toArray(),
			),
		);

		const resumeRunId = runtime.runner.resume({
			runId: 'resume-merge' as RunId,
			completedNodeIds: ['a' as NodeId, 'b' as NodeId],
			outputSnapshots: {
				a: { value: 'foo' },
				b: { value: 'bar' },
			},
		});

		expect(resumeRunId).toBe('resume-merge');
		const mergeEmissions = await mergeEmissions$;
		expect(mergeEmissions.map((event) => event[3].value)).toEqual(
			expect.arrayContaining(['foo', 'bar']),
		);
		expect(mergeEmissions).toHaveLength(2);
		runtime.runner.interrupt('cancel');
	});

	it('replays completed sources into combine multi-input in slot order', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'a', value: 'alpha' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'b', value: 'beta' }),
		);
		runtime.editor.addNode(
			createJoinTestNode({ nodeId: 'join', separator: '|' }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		// Intentionally wire b → slot 0 and a → slot 1 so resume must honor
		// edge slot index, not source node id order.
		wireEdge(runtime.editor, {
			fromNodeId: 'b',
			fromPort: ['value', 0],
			toNodeId: 'join',
			toPort: ['lines', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'a',
			fromPort: ['value', 0],
			toNodeId: 'join',
			toPort: ['lines', 1],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'join',
			fromPort: ['text', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		// Subscribe before resume — sync snapshot replay can emit before await.
		const joinOutput$ = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						isPortTelemetry(event) &&
						event[0] === 'out' &&
						event[1] === ('join' as NodeId) &&
						event[2] === 'text' &&
						'value' in event[3],
				),
			),
		);

		const resumeRunId = runtime.runner.resume({
			runId: 'resume-combine' as RunId,
			completedNodeIds: ['a' as NodeId, 'b' as NodeId],
			outputSnapshots: {
				a: { value: 'alpha' },
				b: { value: 'beta' },
			},
		});

		expect(resumeRunId).toBe('resume-combine');
		const joined = await joinOutput$;
		expect(joined[3].value).toBe('beta|alpha');
	});

	it('replays router bypass slots into merge multi-input', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src-a', value: 'lane-0' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src-b', value: 'lane-1' }),
		);
		runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
		runtime.editor.addNode(createMergeTestNode({ nodeId: 'merge' }));

		wireEdge(runtime.editor, {
			fromNodeId: 'src-a',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'src-b',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 1],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 0],
			toNodeId: 'merge',
			toPort: ['values', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 1],
			toNodeId: 'merge',
			toPort: ['values', 1],
		});

		const mergeEmissions$ = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						isPortTelemetry(event) &&
						event[0] === 'out' &&
						event[1] === ('merge' as NodeId) &&
						event[2] === 'value' &&
						'value' in event[3],
				),
				take(2),
				toArray(),
			),
		);

		runtime.runner.resume({
			runId: 'resume-router-merge' as RunId,
			completedNodeIds: [
				'src-a' as NodeId,
				'src-b' as NodeId,
				'router' as NodeId,
			],
			outputSnapshots: {
				'src-a': { value: 'lane-0' },
				'src-b': { value: 'lane-1' },
				router: {
					ch: 'lane-0',
					'ch@1': 'lane-1',
				},
			},
		});

		const mergeEmissions = await mergeEmissions$;
		expect(mergeEmissions.map((event) => event[3].value)).toEqual(
			expect.arrayContaining(['lane-0', 'lane-1']),
		);
		expect(mergeEmissions).toHaveLength(2);
		runtime.runner.interrupt('cancel');
	});

	it('replays router bypass slots into combine multi-input in slot order', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src-a', value: 'lane-0' }),
		);
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'src-b', value: 'lane-1' }),
		);
		runtime.editor.addNode(createRouterTestNode({ nodeId: 'router' }));
		runtime.editor.addNode(
			createJoinTestNode({ nodeId: 'join', separator: '|' }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wireEdge(runtime.editor, {
			fromNodeId: 'src-a',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'src-b',
			fromPort: ['value', 0],
			toNodeId: 'router',
			toPort: ['ch', 1],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 0],
			toNodeId: 'join',
			toPort: ['lines', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'router',
			fromPort: ['ch', 1],
			toNodeId: 'join',
			toPort: ['lines', 1],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'join',
			fromPort: ['text', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const joinOutput$ = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						isPortTelemetry(event) &&
						event[0] === 'out' &&
						event[1] === ('join' as NodeId) &&
						event[2] === 'text' &&
						'value' in event[3],
				),
			),
		);

		runtime.runner.resume({
			runId: 'resume-router-combine' as RunId,
			completedNodeIds: [
				'src-a' as NodeId,
				'src-b' as NodeId,
				'router' as NodeId,
			],
			outputSnapshots: {
				'src-a': { value: 'lane-0' },
				'src-b': { value: 'lane-1' },
				router: {
					ch: 'lane-0',
					'ch@1': 'lane-1',
				},
			},
		});

		const joined = await joinOutput$;
		expect(joined[3].value).toBe('lane-0|lane-1');
	});
});
