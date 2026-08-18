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
	waitForOutput,
	wireEdge,
} from './workflow-events.js';

const GOAL = 'Describe the feature or bug to implement.';

function createCoderScenario(): {
	readonly runtime: RuntimeHarness;
	readonly hitl: HitlTestNodeHandle;
} {
	const runtime = createRuntimeHarness();
	const hitl = createHitlTestNode({ nodeId: 'review-1' });

	runtime.editor.addNode(
		createConstantTestNode({
			nodeId: 'goal-1',
			value: GOAL,
		}),
	);
	runtime.editor.addNode(
		createConstantTestNode({
			nodeId: 'pattern-1',
			value: 'WorkflowRunSession',
		}),
	);
	runtime.editor.addNode(
		createAgentTestNode({
			nodeId: 'coder-1',
			responsePrefix: 'Coder',
			draftDeltas: ['```', 'ts', '\n', 'patch', '\n', '```'],
		}),
	);
	runtime.editor.addNode(hitl.node);

	wireEdge(runtime.editor, {
		fromNodeId: 'goal-1',
		fromPort: ['value', 0],
		toNodeId: 'coder-1',
		toPort: ['prompt', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'coder-1',
		fromPort: ['response', 0],
		toNodeId: 'review-1',
		toPort: ['question', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'review-1',
		fromPort: ['reply', 0],
		toNodeId: 'coder-1',
		toPort: ['feedback', 0],
	});

	return { runtime, hitl };
}

describe('coder workflow (events$)', () => {
	it('emits review prompt and never done on feedback loop', async () => {
		const { runtime } = createCoderScenario();

		expect(graphHasCycle(runtime.editor.getEdges())).toBe(true);
		expect(runtime.editor.getNodes()).toHaveLength(4);

		const runId = runtime.runner.start();

		const prompt = await waitForOutput(
			runtime,
			'review-1',
			'prompt',
			runId,
		);
		expect(prompt[3].value).toEqual({
			question: `Coder: ${GOAL}`,
			awaiting: true,
		});

		await expect(noDoneWithin(runtime, 100, runId)).resolves.toBe(true);
	});

	it('emits updated agent response after HITL reply on events$', async () => {
		const { runtime, hitl } = createCoderScenario();

		const runId = runtime.runner.start();
		await waitForOutput(runtime, 'review-1', 'prompt', runId);

		hitl.submitReply('Use TDD');

		const response = await waitForOutput(
			runtime,
			'coder-1',
			'response',
			runId,
		);
		expect(response[3].value).toBe('Coder: Use TDD');
	});
});
