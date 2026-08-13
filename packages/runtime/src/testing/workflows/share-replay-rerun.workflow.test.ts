import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { filter, firstValueFrom, of, shareReplay } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';
import { createFinishTestNode } from '../nodes/finish-node.js';
import { createPushableTestNode } from '../nodes/pushable-node.js';
import {
	createRuntimeHarness,
	waitForOutput,
	wireEdge,
	type RuntimeHarness,
} from './workflow-events.js';

/**
 * Passthrough with `shareReplay(1)` on RxJS `.pipe()` (not `pipeValue`).
 * Multicast is created once per node instance so the buffer can outlive a
 * single run's demand subscriptions.
 */
function createShareReplayPassthroughNode(nodeId: string): RuntimeNode {
	const valueIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	// shareReplay once on the instance (RxJS pipe, not pipeValue). Returning the
	// same shared$ from loader keeps the buffer across run demand cycles.
	const shared$ = valueIn.value$.pipe(shareReplay(1));
	const output = statefulObservable({
		loader: () => shared$,
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: { value: valueIn },
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
}

/**
 * Counts events on `valueIn` and emits the running total on `value`.
 * Count lives in the instance closure (not shareReplay) so a second start with
 * a finish node does not settle from a replayed 1 before the next push.
 */
function createCounterNode(nodeId: string): RuntimeNode {
	const valueIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	let count = 0;
	const output = statefulObservable({
		input: valueIn.value$,
		loader: () => of(++count),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'number',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: { value: valueIn },
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
}

const withTimeout = <T>(
	promise: Promise<T>,
	ms: number,
	label: string,
): Promise<T> =>
	Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`${label} timed out after ${ms}ms`));
			}, ms);
		}),
	]);

const waitForDone = (runtime: RuntimeHarness) =>
	firstValueFrom(
		runtime.runner.events$.pipe(
			filter((event): event is ['done', RunId] => event[0] === 'done'),
		),
	);

describe('shareReplay(1) on pipe across run completion', () => {
	it('shareReplay(1) on pipe re-delivers last value on second start without new upstream push', async () => {
		const runtime = createRuntimeHarness();
		const src = createPushableTestNode({ nodeId: 'src' });
		runtime.editor.addNode(src.node);
		runtime.editor.addNode(createShareReplayPassthroughNode('replay'));
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));
		wireEdge(runtime.editor, {
			fromNodeId: 'src',
			fromPort: ['value', 0],
			toNodeId: 'replay',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'replay',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const done1 = waitForDone(runtime);
		const firstOut = waitForOutput(runtime, 'replay', 'value');
		const run1 = runtime.runner.start();
		expect(run1).not.toBe(false);
		src.next('kept');
		expect(
			(await withTimeout(firstOut, 1000, 'run1 replay output'))[4],
		).toBe('kept');
		await withTimeout(done1, 1000, 'run1 done');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('idle');

		// No src.next on run 2 — only shareReplay buffer can re-deliver.
		const secondOut = waitForOutput(runtime, 'replay', 'value');
		const run2 = runtime.runner.start();
		expect(run2).not.toBe(false);
		expect(run2).not.toBe(run1);
		expect(
			(await withTimeout(secondOut, 500, 'run2 replay re-delivery'))[4],
		).toBe('kept');
	});

	it('counter keeps event count across finish done and second start', async () => {
		const runtime = createRuntimeHarness();
		const src = createPushableTestNode({ nodeId: 'src' });
		runtime.editor.addNode(src.node);
		runtime.editor.addNode(createCounterNode('counter'));
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));
		wireEdge(runtime.editor, {
			fromNodeId: 'src',
			fromPort: ['value', 0],
			toNodeId: 'counter',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'counter',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const done1 = waitForDone(runtime);
		const firstOut = waitForOutput(runtime, 'counter', 'value');
		const run1 = runtime.runner.start();
		expect(run1).not.toBe(false);
		src.next('a');
		expect(
			(await withTimeout(firstOut, 1000, 'run1 counter output'))[4],
		).toBe(1);
		await withTimeout(done1, 1000, 'run1 done');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('idle');

		const done2 = waitForDone(runtime);
		const secondOut = waitForOutput(runtime, 'counter', 'value');
		const run2 = runtime.runner.start();
		expect(run2).not.toBe(false);
		expect(run2).not.toBe(run1);
		src.next('b');
		expect(
			(await withTimeout(secondOut, 1000, 'run2 counter output'))[4],
		).toBe(2);
		await withTimeout(done2, 1000, 'run2 done');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('idle');
	});
});
