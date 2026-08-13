import { filter, firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { readOutputValue } from '../readOutputValue.js';
import type { RunId } from '../../types.js';
import { createAgentTestNode } from '../nodes/agent-node.js';
import { createConstantTestNode } from '../nodes/constant-node.js';
import { createDelayTestNode } from '../nodes/delay-node.js';
import { createFinishTestNode } from '../nodes/finish-node.js';
import {
	createHitlTestNode,
	type HitlTestNodeHandle,
} from '../nodes/hitl-node.js';
import {
	createRuntimeHarness,
	noDoneWithin,
	waitForOutput,
	wireEdge,
	type RuntimeHarness,
	edgeIdsFromPortEvent,
} from '../workflows/workflow-events.js';

async function runThenStop(runtime: RuntimeHarness): Promise<string> {
	const runId = runtime.runner.start();
	expect(await firstValueFrom(runtime.runner.status$)).toBe('running');
	runtime.runner.interrupt('cancel');
	expect(await firstValueFrom(runtime.runner.status$)).toBe('stopped');
	return runId;
}

async function runToIdleViaFinish(runtime: RuntimeHarness): Promise<string> {
	const donePromise = firstValueFrom(
		runtime.runner.events$.pipe(
			filter((event): event is ['done', RunId] => event[0] === 'done'),
		),
	);

	const runId = runtime.runner.start();
	await donePromise;
	expect(await firstValueFrom(runtime.runner.status$)).toBe('idle');
	return runId;
}

describe('lyfecycle — empty graph', () => {
	it('start on empty graph emits done and returns to idle', async () => {
		const runtime = createRuntimeHarness();

		const donePromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event): event is ['done', RunId] => event[0] === 'done',
				),
			),
		);

		const runId = runtime.runner.start();
		const done = await donePromise;

		expect(runId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
		expect(done[1]).toBe(runId);
		expect(await firstValueFrom(runtime.runner.status$)).toBe('idle');
	});

	it('allows editor mutations after empty run completes', () => {
		const runtime = createRuntimeHarness();
		runtime.runner.start();

		expect(() =>
			runtime.editor.addNode(
				createConstantTestNode({ nodeId: 'A', value: '1' }),
			),
		).not.toThrow();
	});

	it('after empty run completes, user can add nodes and start wired graph', async () => {
		const runtime = createRuntimeHarness();

		runtime.runner.start();
		expect(await firstValueFrom(runtime.runner.status$)).toBe('idle');

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'seed' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		wireEdge(runtime.editor, {
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});

		expect(runtime.editor.getNodes()).toHaveLength(2);
		expect(runtime.editor.getEdges()).toHaveLength(1);

		const runId = runtime.runner.start();
		expect(runId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);
		expect(await firstValueFrom(runtime.runner.status$)).toBe('running');

		runtime.runner.interrupt('cancel');
	});

	it('orphan nodes run on global start and stay running until interrupt', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'alone' }),
		);

		const outputPromise = waitForOutput(runtime, 'A', 'value');
		const runId = runtime.runner.start();

		expect((await outputPromise)[4]).toBe('alone');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('running');
		expect(await noDoneWithin(runtime, 50, runId)).toBe(true);

		runtime.runner.interrupt('cancel');
	});
});

describe('lyfecycle — graph mutations between runs', () => {
	it('allows addNode and addEdge while stopped after interrupt', async () => {
		const runtime = createRuntimeHarness();

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		wireEdge(runtime.editor, {
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});

		await runThenStop(runtime);

		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'C', delayMs: 0 }),
		);
		wireEdge(runtime.editor, {
			fromNodeId: 'B',
			fromPort: ['value', 0],
			toNodeId: 'C',
			toPort: ['value', 0],
		});

		expect(runtime.editor.getNodes()).toHaveLength(3);
		expect(runtime.editor.getEdges()).toHaveLength(2);
	});

	it('second run after graph edit produces output on extended path', async () => {
		const runtime = createRuntimeHarness();

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'hello' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));
		wireEdge(runtime.editor, {
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'B',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		await runToIdleViaFinish(runtime);

		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'C', delayMs: 0 }),
		);
		runtime.editor.removeEdge(
			runtime.editor
				.getEdges()
				.find((edge) => edge.toNodeId === 'finish')!.edgeId,
		);
		wireEdge(runtime.editor, {
			fromNodeId: 'B',
			fromPort: ['value', 0],
			toNodeId: 'C',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'C',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const outputPromise = waitForOutput(runtime, 'C', 'value');
		runtime.runner.start();
		expect((await outputPromise)[4]).toBe('hello');

		runtime.runner.interrupt('cancel');
	});

	it('removes middle node after run and next run skips deleted subgraph', async () => {
		const runtime = createRuntimeHarness();

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'x' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'C', delayMs: 0 }),
		);
		wireEdge(runtime.editor, {
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'B',
			fromPort: ['value', 0],
			toNodeId: 'C',
			toPort: ['value', 0],
		});

		await runThenStop(runtime);

		expect(runtime.editor.removeNode('B')).toEqual(
			expect.objectContaining({ nodeId: 'B' }),
		);
		expect(runtime.editor.getNodes()).toHaveLength(2);
		expect(runtime.editor.getEdges()).toHaveLength(0);

		const events: RuntimeRunnerEvent[] = [];
		const subscription = runtime.runner.events$.subscribe((event) => {
			events.push(event);
		});

		const runId = runtime.runner.start();

		await new Promise((resolve) => {
			setTimeout(resolve, 50);
		});

		subscription.unsubscribe();

		expect(
			events.some(
				(event) =>
					event[0] === 'out' &&
					event[1] === 'A' &&
					edgeIdsFromPortEvent(event).length === 0,
			),
		).toBe(true);
		expect(events.some((event) => event[0] === 'done')).toBe(false);
		expect(
			await readOutputValue(runtime.editor.getNode('A')!.outputs.value),
		).toBe('x');
		expect(runtime.editor.getNode('B')).toBe(false);

		runtime.runner.interrupt('cancel');
	});

	it('starts a fresh run from stopped after interrupt without returning to idle', async () => {
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'A', value: 'first' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'B', delayMs: 0 }),
		);
		runtime.editor.addNode(createFinishTestNode({ nodeId: 'finish' }));
		wireEdge(runtime.editor, {
			fromNodeId: 'A',
			fromPort: ['value', 0],
			toNodeId: 'B',
			toPort: ['value', 0],
		});
		wireEdge(runtime.editor, {
			fromNodeId: 'B',
			fromPort: ['value', 0],
			toNodeId: 'finish',
			toPort: ['value', 0],
		});

		const firstRunId = runtime.runner.start();
		runtime.runner.interrupt('cancel');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('stopped');

		const secondRunId = runtime.runner.start();
		expect(secondRunId).not.toBe(firstRunId);
		expect(await firstValueFrom(runtime.runner.status$)).toBe('running');

		runtime.runner.interrupt('cancel');
	});
});

const PROMPT = 'Draft a short plan.';

function wireAgentHitlLoop(
	runtime: RuntimeHarness,
	agentId: string,
	hitl: HitlTestNodeHandle,
	promptNodeId: string,
): void {
	wireEdge(runtime.editor, {
		fromNodeId: promptNodeId,
		fromPort: ['value', 0],
		toNodeId: agentId,
		toPort: ['prompt', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: agentId,
		fromPort: ['response', 0],
		toNodeId: hitl.node.nodeId,
		toPort: ['question', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: hitl.node.nodeId,
		fromPort: ['reply', 0],
		toNodeId: agentId,
		toPort: ['feedback', 0],
	});
}

describe('lyfecycle — stop HITL run and edit graph', () => {
	it('interrupt during HITL allows graph edits before next run', async () => {
		const runtime = createRuntimeHarness();
		const hitl = createHitlTestNode({ nodeId: 'review-1' });

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'goal-1', value: PROMPT }),
		);
		runtime.editor.addNode(
			createAgentTestNode({
				nodeId: 'plan-1',
				responsePrefix: 'Plan',
			}),
		);
		runtime.editor.addNode(hitl.node);
		wireAgentHitlLoop(runtime, 'plan-1', hitl, 'goal-1');

		const runId = runtime.runner.start();
		await waitForOutput(runtime, 'review-1', 'prompt', runId);
		await expect(noDoneWithin(runtime, 50, runId)).resolves.toBe(true);

		runtime.runner.interrupt('cancel');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('stopped');

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'extra-1', value: 'added' }),
		);
		expect(runtime.editor.getNodes()).toHaveLength(4);
	});

	it('replaces HITL loop with acyclic graph after stop', async () => {
		const runtime = createRuntimeHarness();
		const hitl = createHitlTestNode({ nodeId: 'review-1' });

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'goal-1', value: PROMPT }),
		);
		runtime.editor.addNode(
			createAgentTestNode({
				nodeId: 'plan-1',
				responsePrefix: 'Plan',
			}),
		);
		runtime.editor.addNode(hitl.node);
		wireAgentHitlLoop(runtime, 'plan-1', hitl, 'goal-1');

		const hitlRunId = runtime.runner.start();
		await waitForOutput(runtime, 'review-1', 'prompt', hitlRunId);
		runtime.runner.interrupt('cancel');

		expect(runtime.editor.removeNode('review-1')).toEqual(
			expect.objectContaining({ nodeId: 'review-1' }),
		);
		expect(runtime.editor.removeNode('plan-1')).toEqual(
			expect.objectContaining({ nodeId: 'plan-1' }),
		);
		expect(runtime.editor.getEdges()).toHaveLength(0);

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'echo-1', value: 'done' }),
		);
		runtime.editor.addNode(
			createDelayTestNode({ nodeId: 'tail-1', delayMs: 0 }),
		);
		wireEdge(runtime.editor, {
			fromNodeId: 'echo-1',
			fromPort: ['value', 0],
			toNodeId: 'tail-1',
			toPort: ['value', 0],
		});

		expect(runtime.editor.getNodes()).toHaveLength(3);
		expect(runtime.editor.getEdges()).toHaveLength(1);

		const linearRunId = runtime.runner.start();
		expect(linearRunId).not.toBe(hitlRunId);
		expect(await firstValueFrom(runtime.runner.status$)).toBe('running');

		runtime.runner.interrupt('cancel');
		expect(await firstValueFrom(runtime.runner.status$)).toBe('stopped');
	});

	it('does not deliver HITL reply after interrupt teardown', async () => {
		const runtime = createRuntimeHarness();
		const hitl = createHitlTestNode({ nodeId: 'review-1' });

		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'goal-1', value: PROMPT }),
		);
		runtime.editor.addNode(
			createAgentTestNode({
				nodeId: 'plan-1',
				responsePrefix: 'Plan',
			}),
		);
		runtime.editor.addNode(hitl.node);
		wireAgentHitlLoop(runtime, 'plan-1', hitl, 'goal-1');

		const runId = runtime.runner.start();
		await waitForOutput(runtime, 'review-1', 'prompt', runId);
		runtime.runner.interrupt('cancel');

		hitl.submitReply('too late');

		const lateResponse = await Promise.race([
			waitForOutput(runtime, 'plan-1', 'response', runId),
			new Promise<'timeout'>((resolve) => {
				setTimeout(() => resolve('timeout'), 50);
			}),
		]);

		expect(lateResponse).toBe('timeout');
	});
});
