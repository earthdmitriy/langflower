import {
	combineStatefulObservables,
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { concatMap, delay, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
	isPortTelemetry,
	type NodeId,
	type PortMeta,
	type RuntimeNode,
} from '../../types.js';
import { createConstantTestNode } from '../nodes/constant-node.js';
import { createDelayTestNode } from '../nodes/delay-node.js';
import { createFinishTestNode } from '../nodes/finish-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	dtoHas,
	dtoIndex,
	runAndCollectEvents,
	wireEdge,
} from './workflow-events.js';

/**
 * **Reproduction of the production bug** (see `docs/FOUND_BUGS.md` BUG-2026-07-14).
 *
 * The harness `createConstantTestNode` emits `pending` (it wraps the value in a
 * `statefulObservable({ loader })`), so the tests above can never catch a node
 * that *fails* to emit `pending`. The real production `common-string` /
 * `common-finish` are sync primitives that emit **value-only** outputs (they
 * surface the input `statefulConnection` directly, with no loader → no loading
 * sentinel). The old production `common-delay` built its output from
 * `combineStatefulObservables([valueIn, delayIn]).pipeValue(concatMap(delay))`.
 * Because its upstream never goes `pending`, the combine never sees a `loading`
 * input, so the delay output never emits `pending` either — the canvas "working"
 * highlight was dead.
 *
 * `createSyncSourceTestNode` mirrors the production sync-primitive behaviour
 * (value-only, no `pending`). `createDelayBrokenTestNode` mirrors the *old*
 * production delay pattern. The test asserts the delay output has **no**
 * `pending` — i.e. it reproduces the exact production defect.
 */

const PORT = (portId: string): PortMeta =>
	({
		dir: 'out',
		portId,
		wireType: 'any',
	}) satisfies PortMeta;

function createSyncSourceTestNode(options: {
	readonly nodeId: string;
	readonly value: string;
}): RuntimeNode {
	const { nodeId, value } = options;
	const output = statefulConnection<unknown, unknown, PortMeta>({
		meta: PORT('value'),
	});
	output.connect(of(value));

	return {
		nodeId: nodeId as NodeId,
		inputs: {},
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
}

function createDelayBrokenTestNode(options: {
	readonly nodeId: string;
	readonly delayMs: number;
}): RuntimeNode {
	const { nodeId, delayMs } = options;
	const valueIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: { dir: 'in', portId: 'value', wireType: 'any', mode: 'single' },
	});
	const delayIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'delay',
			wireType: 'number',
			mode: 'single',
		},
	});
	delayIn.connect(of(delayMs));

	const combined$ = combineStatefulObservables(
		[valueIn, delayIn],
		([inputValue, delayMs]) => ({ inputValue, delayMs }),
	);
	const output$ = combined$
		.pipeValue(
			concatMap(({ inputValue, delayMs }) =>
				of(inputValue).pipe(delay(Math.max(0, delayMs as number))),
			),
		)
		.with({
			meta: { dir: 'out', portId: 'value', wireType: 'any' },
		} satisfies PortMeta);

	return {
		nodeId: nodeId as NodeId,
		inputs: { value: valueIn, delay: delayIn },
		outputs: { value: output$ },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
}

function wire(
	harness: RuntimeHarness,
	fromNodeId: string,
	toNodeId: string,
	toPort = 'value',
): void {
	wireEdge(harness.editor, {
		fromNodeId,
		fromPort: ['value', 0],
		toNodeId,
		toPort: [toPort, 0],
	});
}

/**
 * Proves that nodes emit `output-emitted` with `{ pending: true }` during
 * the loading phase, before the success `{ value }` arrives. This is
 * the mechanism that should drive the yellow "working" indicator on nodes
 * in the UI.
 *
 * `statefulObservable` always pushes a loading sentinel first, even for
 * synchronous loaders (`of(value)`). The `pipeValue` + `tap` path in
 * `runtime-runner.ts` maps `ResponseWithStatus` through `serializeResponse`
 * onto the same port (`{ pending: true }` then `{ value }`).
 *
 * NOTE: the three tests below use the harness `createConstantTestNode`, which
 * itself emits `pending` (it wraps the value in `statefulObservable({ loader })`).
 * That means they verify the *runtime* forwards `pending` correctly, but they
 * can never catch a node that *fails* to emit `pending`. The production bug
 * (BUG-2026-07-14) lived in exactly such a node — a sync source (`common-string`)
 * emits value-only, and the old `common-delay` `combineStatefulObservables(...)`
 * pattern reflected that and never emitted `pending`. See the
 * "production bug reproduction" describe block further down for the actual
 * repro and the fixed-pattern contrast.
 */
describe('pending state in workflow event log', () => {
	it('async delay node emits pending before value', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hi' }),
		);
		harness.editor.addNode(
			createDelayTestNode({ nodeId: 'd1', delayMs: 100 }),
		);
		harness.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wire(harness, 'src', 'd1');
		wire(harness, 'd1', 'finish');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			200,
		);

		const d1States = events
			.filter(
				(event) =>
					event[0] === 'out' &&
					event[1] === 'd1' &&
					event[2] === 'value',
			)
			.map((event) => event[3]);

		expect(dtoHas(d1States, 'pending')).toBe(true);
		expect(dtoHas(d1States, 'value')).toBe(true);
		expect(dtoIndex(d1States, 'pending')).toBeLessThan(
			dtoIndex(d1States, 'value'),
		);
	});

	it('primitive node emits pending then value (sync overwrite in relay)', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'src', value: 'hi' }),
		);
		harness.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wire(harness, 'src', 'finish');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			50,
		);

		const srcStates = events
			.filter(
				(event) =>
					event[0] === 'out' &&
					event[1] === 'src' &&
					event[2] === 'value',
			)
			.map((event) => event[3]);

		expect(dtoHas(srcStates, 'pending')).toBe(true);
		expect(dtoHas(srcStates, 'value')).toBe(true);
		expect(dtoIndex(srcStates, 'pending')).toBeLessThan(
			dtoIndex(srcStates, 'value'),
		);
	});

	it('multi-node chain: pending appears only on async nodes', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createConstantTestNode({ nodeId: 'c1', value: 'start' }),
		);
		harness.editor.addNode(
			createDelayTestNode({ nodeId: 'd1', delayMs: 50 }),
		);
		harness.editor.addNode(
			createDelayTestNode({ nodeId: 'd2', delayMs: 50 }),
		);
		harness.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wire(harness, 'c1', 'd1');
		wire(harness, 'd1', 'd2');
		wire(harness, 'd2', 'finish');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			200,
		);

		const statesOf = (nodeId: string) =>
			events
				.filter(
					(event) =>
						event[0] === 'out' &&
						event[1] === nodeId &&
						event[2] === 'value',
				)
				.map((event) => event[3]);

		const c1States = statesOf('c1');
		const d1States = statesOf('d1');
		const d2States = statesOf('d2');

		expect(dtoHas(c1States, 'pending')).toBe(true);
		expect(dtoHas(c1States, 'value')).toBe(true);
		expect(dtoIndex(c1States, 'pending')).toBeLessThan(
			dtoIndex(c1States, 'value'),
		);

		expect(dtoHas(d1States, 'pending')).toBe(true);
		expect(dtoHas(d1States, 'value')).toBe(true);
		expect(dtoIndex(d1States, 'pending')).toBeLessThan(
			dtoIndex(d1States, 'value'),
		);

		expect(dtoHas(d2States, 'pending')).toBe(true);
		expect(dtoHas(d2States, 'value')).toBe(true);
		expect(dtoIndex(d2States, 'pending')).toBeLessThan(
			dtoIndex(d2States, 'value'),
		);
	});
});

/**
 * `@rx-evo` behaviour reference (BUG-2026-07-14), NOT a node bug. A combine of
 * value-only sources DOES emit `pending` (the combine surfaces each input's
 * loading phase). The reported bug was the server-side `events$` delivery race
 * (fixed in `attach-langflower-bridge.ts`), not the node pattern — the real
 * `common-delay` node also emits `pending`. These tests document that sync-seeded
 * connections and combines surface `pending`, matching `createDelayTestNode`
 * (above) and the production delay node.
 */
describe('pending state — combine of value-only sources', () => {
	it('sync source emits pending then value (like common-string)', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createSyncSourceTestNode({ nodeId: 'src', value: 'hi' }),
		);
		harness.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));
		wire(harness, 'src', 'finish');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			50,
		);

		const srcStates = statesOfNode(events, runId, 'src');
		expect(dtoHas(srcStates, 'value')).toBe(true);
		expect(dtoHas(srcStates, 'pending')).toBe(true);
	});

	it('combineStatefulObservables of value-only sources emits pending', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createSyncSourceTestNode({ nodeId: 'src', value: 'hi' }),
		);
		harness.editor.addNode(
			createDelayBrokenTestNode({ nodeId: 'd1', delayMs: 100 }),
		);
		harness.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wire(harness, 'src', 'd1');
		wire(harness, 'd1', 'finish');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			200,
		);

		const d1States = statesOfNode(events, runId, 'd1');
		expect(dtoHas(d1States, 'value')).toBe(true);
		expect(dtoHas(d1States, 'pending')).toBe(true);
	});

	it('statefulObservable({ input, loader }) emits pending (contrast)', async () => {
		const harness = createRuntimeHarness();
		harness.editor.addNode(
			createSyncSourceTestNode({ nodeId: 'src', value: 'hi' }),
		);
		harness.editor.addNode(
			createDelayTestNode({ nodeId: 'd1', delayMs: 100 }),
		);
		harness.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));

		wire(harness, 'src', 'd1');
		wire(harness, 'd1', 'finish');

		const { runId, events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			200,
		);

		const d1States = statesOfNode(events, runId, 'd1');
		expect(dtoHas(d1States, 'pending')).toBe(true);
		expect(dtoHas(d1States, 'value')).toBe(true);
		expect(dtoIndex(d1States, 'pending')).toBeLessThan(
			dtoIndex(d1States, 'value'),
		);
	});

	it('serializes a user `{ pending: true }` payload as a value, not pending', async () => {
		const output = statefulObservable({
			loader: () => of({ pending: true }),
			meta: {
				dir: 'out',
				portId: 'value',
				wireType: 'any',
			} satisfies PortMeta,
		});
		const node: RuntimeNode = {
			nodeId: 'src' as NodeId,
			inputs: {},
			outputs: { value: output },
			bypassPorts: {},
			emitOncePerActivation: true,
		};

		const harness = createRuntimeHarness();
		harness.editor.addNode(node);
		const { events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			30,
		);

		const values = events.filter(
			(event) =>
				isPortTelemetry(event) &&
				event[0] === 'out' &&
				event[2] === 'value' &&
				'value' in event[3],
		);
		expect(
			values.some(
				(event) =>
					JSON.stringify(event[3].value) ===
					JSON.stringify({ pending: true }),
			),
		).toBe(true);
	});
});

function statesOfNode(
	events: readonly import('../../types.js').RuntimeRunnerEvent[],
	runId: string,
	nodeId: string,
): unknown[] {
	return events
		.filter(
			(event) =>
				event[0] === 'out' &&
				event[1] === nodeId &&
				event[2] === 'value',
		)
		.map((event) => event[3]);
}
