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

const TOPIC = 'Research a topic and save Markdown notes.';

function createExplorerScenario(): {
	readonly runtime: RuntimeHarness;
	readonly hitl: HitlTestNodeHandle;
} {
	const runtime = createRuntimeHarness();
	const hitl = createHitlTestNode({ nodeId: 'review-1' });

	runtime.editor.addNode(
		createConstantTestNode({
			nodeId: 'topic-1',
			value: TOPIC,
		}),
	);
	runtime.editor.addNode(
		createConstantTestNode({
			nodeId: 'seed-url-1',
			value: 'https://example.com',
		}),
	);
	runtime.editor.addNode(
		createAgentTestNode({
			nodeId: 'explorer-1',
			responsePrefix: 'Explorer',
			draftDeltas: ['## ', 'Notes', '\n', 'Saved'],
		}),
	);
	runtime.editor.addNode(hitl.node);

	wireEdge(runtime.editor, {
		fromNodeId: 'topic-1',
		fromPort: ['value', 0],
		toNodeId: 'explorer-1',
		toPort: ['prompt', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'explorer-1',
		fromPort: ['response', 0],
		toNodeId: 'review-1',
		toPort: ['question', 0],
	});
	wireEdge(runtime.editor, {
		fromNodeId: 'review-1',
		fromPort: ['reply', 0],
		toNodeId: 'explorer-1',
		toPort: ['feedback', 0],
	});

	return { runtime, hitl };
}

describe('explorer workflow (events$)', () => {
	it('emits review prompt and never done on feedback loop', async () => {
		const { runtime } = createExplorerScenario();

		expect(graphHasCycle(runtime.editor.getEdges())).toBe(true);
		expect(runtime.editor.getNodes()).toHaveLength(4);

		const runId = runtime.runner.start();

		const prompt = await waitForOutput(
			runtime,
			'review-1',
			'prompt',
			runId,
		);
		expect(prompt.runId).toBe(runId);
		expect(prompt.value).toEqual({
			question: `Explorer: ${TOPIC}`,
			awaiting: true,
		});

		await expect(noDoneWithin(runtime, 100, runId)).resolves.toBe(true);
	});

	it('emits updated agent response after HITL reply on events$', async () => {
		const { runtime, hitl } = createExplorerScenario();

		const runId = runtime.runner.start();
		await waitForOutput(runtime, 'review-1', 'prompt', runId);

		hitl.submitReply('Focus on API docs');

		const response = await waitForOutput(
			runtime,
			'explorer-1',
			'response',
			runId,
		);
		expect(response.runId).toBe(runId);
		expect(response.value).toBe('Explorer: Focus on API docs');
	});
});
