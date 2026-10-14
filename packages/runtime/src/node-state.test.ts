import { statefulObservable } from '@rx-evo/stateful-observable';
import { filter, firstValueFrom, of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createConstantTestNode } from './testing/nodes/constant-node.js';
import { createRuntimeHarness } from './testing/workflows/workflow-events.js';
import {
	type NodeId,
	type NodeStateHook,
	type NodeStateJson,
	type PortMeta,
	type RunId,
	type RuntimeNode,
	type RuntimeNodeStates,
	type RuntimeRunnerEvent,
} from './types.js';

const nodeId = (value: string): NodeId => value as NodeId;

const okRestore = (): {
	readonly ok: true;
} => ({ ok: true });

const hookedNode = (
	id: string,
	hook: NodeStateHook,
	options?: { readonly stopsRun?: boolean },
): RuntimeNode => {
	const output = statefulObservable({
		loader: () => of('ok'),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'string',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId(id),
		inputs: {},
		outputs: { value: output },
		bypassPorts: {},
		...(options?.stopsRun === true ? { stopsRun: true } : {}),
		state: hook,
	};
};

const trackingHook = (
	id: string,
	calls: { nodeId: string; state: NodeStateJson | null }[],
	restore: NodeStateHook['restore'] = okRestore,
): {
	readonly hook: NodeStateHook;
	readonly persist$: Subject<NodeStateJson>;
} => {
	const persist$ = new Subject<NodeStateJson>();

	return {
		persist$,
		hook: {
			persist$,
			restore: (state) => {
				calls.push({ nodeId: id, state });
				return restore(state);
			},
		},
	};
};

const statesById = (
	calls: readonly { nodeId: string; state: NodeStateJson | null }[],
): Record<string, NodeStateJson | null> =>
	Object.fromEntries(calls.map((call) => [call.nodeId, call.state]));

describe('RuntimeRunner node state', () => {
	it('restores null when nodeStates omits a hooked node and the value when present', () => {
		const calls: { nodeId: string; state: NodeStateJson | null }[] = [];
		const kept = trackingHook('kept', calls);
		const fresh = trackingHook('fresh', calls);
		const { editor, runner } = createRuntimeHarness();

		editor.addNode(hookedNode('kept', kept.hook));
		editor.addNode(hookedNode('fresh', fresh.hook));
		editor.addNode(createConstantTestNode({ nodeId: 'plain', value: 'x' }));

		const runId = runner.start(undefined, undefined, {
			nodeStates: {
				kept: { n: 1 },
				fresh: 0,
			} satisfies RuntimeNodeStates,
		});

		expect(runId).not.toBe(false);
		expect(statesById(calls)).toEqual({
			kept: { n: 1 },
			fresh: 0,
		});
		expect(runner.lastRestoreFailures).toEqual([]);
	});

	it('restores only the startNode cluster', () => {
		const calls: { nodeId: string; state: NodeStateJson | null }[] = [];
		const { editor, runner } = createRuntimeHarness();

		editor.addNode(hookedNode('kept', trackingHook('kept', calls).hook));
		editor.addNode(hookedNode('other', trackingHook('other', calls).hook));

		const runId = runner.startNode(nodeId('kept'), undefined, undefined, {
			nodeStates: { kept: 'only', other: 'ignored' },
		});

		expect(runId).not.toBe(false);
		expect(statesById(calls)).toEqual({ kept: 'only' });
	});

	it('records restore failures and still starts', () => {
		const calls: { nodeId: string; state: NodeStateJson | null }[] = [];
		let fail = true;
		const { editor, runner } = createRuntimeHarness();

		editor.addNode(
			hookedNode(
				'agent',
				trackingHook('agent', calls, () => {
					if (fail) {
						return { ok: false, message: 'bad json' };
					}

					return { ok: true };
				}).hook,
			),
		);

		const runId = runner.start(undefined, undefined, {
			nodeStates: { agent: null },
		});

		expect(runId).not.toBe(false);
		expect(runner.status).toBe('running');
		expect(calls).toEqual([{ nodeId: 'agent', state: null }]);
		expect(runner.lastRestoreFailures).toEqual([
			{ nodeId: 'agent', message: 'bad json' },
		]);

		expect(runner.start()).toBe(false);
		expect(runner.lastRestoreFailures).toEqual([
			{ nodeId: 'agent', message: 'bad json' },
		]);

		fail = false;
		runner.interrupt('cancel');
		calls.length = 0;
		runner.start();
		expect(runner.lastRestoreFailures).toEqual([]);
		expect(statesById(calls)).toEqual({ agent: null });
	});

	it('restores resume nodeStates before wiring', () => {
		const calls: { nodeId: string; state: NodeStateJson | null }[] = [];
		const { editor, runner } = createRuntimeHarness();

		editor.addNode(hookedNode('kept', trackingHook('kept', calls).hook));
		editor.addNode(hookedNode('fresh', trackingHook('fresh', calls).hook));
		runner.start();
		runner.interrupt('cancel');
		calls.length = 0;

		const runId = runner.resume({
			completedNodeIds: [],
			outputSnapshots: {},
			nodeStates: { kept: 'again' },
		});

		expect(runId).not.toBe(false);
		expect(statesById(calls)).toEqual({
			kept: 'again',
			fresh: null,
		});
	});

	it('emits persist$ on nodeState$ during the run and stops after interrupt', async () => {
		const calls: { nodeId: string; state: NodeStateJson | null }[] = [];
		const tracked = trackingHook('agent', calls);
		const seen: { nodeId: string; state: NodeStateJson }[] = [];
		const { editor, runner } = createRuntimeHarness();

		editor.addNode(hookedNode('agent', tracked.hook));
		const sub = runner.nodeState$.subscribe((event) => {
			seen.push(event);
		});

		runner.start();
		await Promise.resolve();
		expect(runner.status).toBe('running');
		tracked.persist$.next('during');
		runner.interrupt('cancel');
		tracked.persist$.next('after');

		expect(seen).toEqual([{ nodeId: 'agent', state: 'during' }]);
		expect(runner.status).toBe('stopped');
		sub.unsubscribe();
	});

	it('stops nodeState$ after a stopsRun node finishes the run', async () => {
		const calls: { nodeId: string; state: NodeStateJson | null }[] = [];
		const tracked = trackingHook('agent', calls);
		const seen: NodeStateJson[] = [];
		const { editor, runner } = createRuntimeHarness();

		editor.addNode(hookedNode('agent', tracked.hook, { stopsRun: true }));
		const sub = runner.nodeState$.subscribe((event) => {
			seen.push(event.state);
		});

		runner.start();
		tracked.persist$.next({ phase: 'live' });
		await firstValueFrom(
			runner.status$.pipe(filter((status) => status === 'idle')),
		);
		tracked.persist$.next({ phase: 'after' });

		expect(seen).toEqual([{ phase: 'live' }]);
		sub.unsubscribe();
	});

	it('stays quiet when no in-scope node has a state hook', async () => {
		const seen: unknown[] = [];
		const { editor, runner } = createRuntimeHarness();

		editor.addNode(createConstantTestNode({ nodeId: 'plain', value: 'x' }));
		const sub = runner.nodeState$.subscribe((event) => {
			seen.push(event);
		});

		runner.start();
		await Promise.resolve();
		expect(seen).toEqual([]);
		sub.unsubscribe();
		runner.interrupt('cancel');
	});

	it('seedEventLog replaces the log only while idle and logging', async () => {
		const { editor, runner } = createRuntimeHarness({ log: true });
		const first: RuntimeRunnerEvent = ['done', 'first' as RunId];
		const replacement: RuntimeRunnerEvent = ['done', 'seeded' as RunId];
		const ignored: RuntimeRunnerEvent = ['done', 'ignored' as RunId];

		runner.seedEventLog([first]);
		expect([...runner.eventLog]).toEqual([first]);
		runner.seedEventLog([replacement]);
		expect([...runner.eventLog]).toEqual([replacement]);

		editor.addNode(createConstantTestNode({ nodeId: 'src', value: 'x' }));
		runner.start();
		const whileRunning = [...runner.eventLog];
		runner.seedEventLog([ignored]);
		expect([...runner.eventLog]).toEqual(whileRunning);

		runner.interrupt('cancel');
		expect(runner.status).toBe('stopped');
		runner.seedEventLog([ignored]);
		expect([...runner.eventLog]).toEqual(whileRunning);

		runner.start();
		await Promise.resolve();
		runner.completeRun();
		expect(runner.status).toBe('idle');
		runner.seedEventLog([replacement]);
		expect([...runner.eventLog]).toEqual([replacement]);

		const noLog = createRuntimeHarness();
		noLog.runner.seedEventLog([first]);
		expect(noLog.runner.eventLog).toEqual([]);
	});
});
