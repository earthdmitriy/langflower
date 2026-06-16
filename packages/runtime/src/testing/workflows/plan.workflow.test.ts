import { describe, expect, it } from 'vitest';
import { graphHasCycle } from '../../runtime-helpers.js';
import { createAgentTestNode } from '../nodes/agent-node.js';
import { createConstantTestNode } from '../nodes/constant-node.js';
import {
	createHitlTestNode,
	type HitlTestNodeHandle,
} from '../nodes/hitl-node.js';
import {
	type RuntimeHarness,
	createRuntimeHarness,
	noDoneWithin,
	outputValues,
	runAndCollectEvents,
	waitForOutput,
	wireEdge,
} from './workflow-events.js';

const GOAL =
	'Explore the project and write an implementation plan in Markdown.';

function createPlanScenario(): {
	readonly runtime: RuntimeHarness;
	readonly hitl: HitlTestNodeHandle;
} {
	const runtime = createRuntimeHarness();
	const hitl = createHitlTestNode({ nodeId: 'review-1' });

	runtime.editor.addNode(
		createConstantTestNode({ nodeId: 'goal-1', value: GOAL }),
	);
	runtime.editor.addNode(
		createAgentTestNode({
			nodeId: 'plan-1',
			responsePrefix: 'Plan',
			draftDeltas: ['# ', 'Plan', '\n\n', 'Done'],
		}),
	);
	runtime.editor.addNode(hitl.node);

	wireEdge(runtime.editor, {
		fromNodeId: 'goal-1',
		fromPort: ['value', 0],
		toNodeId: 'plan-1',
		toPort: ['prompt', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'plan-1',
		fromPort: ['response', 0],
		toNodeId: 'review-1',
		toPort: ['question', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'review-1',
		fromPort: ['reply', 0],
		toNodeId: 'plan-1',
		toPort: ['feedback', 0],
	});

	return { runtime, hitl };
}

describe('plan workflow (events$)', () => {
	it('emits agent response and draft chunks for the run', async () => {
		const { runtime } = createPlanScenario();

		expect(graphHasCycle(runtime.editor.getEdges())).toBe(true);

		const { runId, events } = await runAndCollectEvents(runtime, () =>
			runtime.runner.start(),
		);

		expect(outputValues(events, 'plan-1', 'response', runId)).toEqual([
			'Plan: Explore the project and write an implementation plan in Markdown.',
		]);

		const draftValues = outputValues(events, 'plan-1', 'draft', runId);
		expect(draftValues).toEqual(['# ', 'Plan', '\n\n', 'Done']);

		for (const event of events) {
			if (
				event.kind === 'output-emitted' ||
				event.kind === 'input-received'
			) {
				expect(event.runId).toBe(runId);
				expect(event.edgeIds).toBeInstanceOf(Array);
			}
		}
	});

	it('emits review prompt and never done on feedback loop', async () => {
		const { runtime } = createPlanScenario();

		const runId = runtime.runner.start();

		const prompt = await waitForOutput(
			runtime,
			'review-1',
			'prompt',
			runId,
		);
		expect(prompt.runId).toBe(runId);
		expect(prompt.value).toEqual({
			question: `Plan: ${GOAL}`,
			awaiting: true,
		});

		await expect(noDoneWithin(runtime, 100, runId)).resolves.toBe(true);
	});

	it('emits updated agent response after HITL reply on events$', async () => {
		const { runtime, hitl } = createPlanScenario();

		const runId = runtime.runner.start();
		await waitForOutput(runtime, 'review-1', 'prompt', runId);

		hitl.submitReply('Add a testing section');

		const response = await waitForOutput(
			runtime,
			'plan-1',
			'response',
			runId,
		);
		expect(response.runId).toBe(runId);
		expect(response.value).toBe('Plan: Add a testing section');
	});
});
