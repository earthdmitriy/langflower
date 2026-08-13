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

const PROMPT = 'Say hello and ask what I should help with next.';

function createSimpleScenario(): {
	readonly runtime: RuntimeHarness;
	readonly hitl: HitlTestNodeHandle;
} {
	const runtime = createRuntimeHarness();
	const hitl = createHitlTestNode({ nodeId: 'ask-1' });

	runtime.editor.addNode(
		createConstantTestNode({ nodeId: 'prompt-1', value: PROMPT }),
	);
	runtime.editor.addNode(
		createAgentTestNode({
			nodeId: 'llm-1',
			responsePrefix: 'Agent',
			draftDeltas: ['Hello', '!', ' How', ' can', ' I', ' help', '?'],
		}),
	);
	runtime.editor.addNode(hitl.node);

	wireEdge(runtime.editor, {
		fromNodeId: 'prompt-1',
		fromPort: ['value', 0],
		toNodeId: 'llm-1',
		toPort: ['prompt', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'llm-1',
		fromPort: ['response', 0],
		toNodeId: 'ask-1',
		toPort: ['question', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'ask-1',
		fromPort: ['reply', 0],
		toNodeId: 'llm-1',
		toPort: ['feedback', 0],
	});

	return { runtime, hitl };
}

describe('simple workflow (events$)', () => {
	it('emits ask-user prompt and never done on feedback loop', async () => {
		const { runtime } = createSimpleScenario();

		expect(graphHasCycle(runtime.editor.getEdges())).toBe(true);

		const runId = runtime.runner.start();

		const prompt = await waitForOutput(runtime, 'ask-1', 'prompt', runId);
		expect(prompt[4]).toEqual({
			question: `Agent: ${PROMPT}`,
			awaiting: true,
		});

		await expect(noDoneWithin(runtime, 100, runId)).resolves.toBe(true);
	});

	it('emits updated agent response after HITL reply on events$', async () => {
		const { runtime, hitl } = createSimpleScenario();

		const runId = runtime.runner.start();
		await waitForOutput(runtime, 'ask-1', 'prompt', runId);

		hitl.submitReply('Focus on tests');

		const response = await waitForOutput(
			runtime,
			'llm-1',
			'response',
			runId,
		);
		expect(response[4]).toBe('Agent: Focus on tests');
	});
});
