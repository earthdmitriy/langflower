import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import {
	agentReviewAcceptWorkflow,
	agentReviewLoopWorkflow,
} from '../helpers/scenarios/agents-mock.js';

describe('execute agent review (WS bridge)', () => {
	it('defines review accept scenario graph', () => {
		const scenario = agentReviewAcceptWorkflow();

		expect(scenario.workflowId).toBe('agent-review-accept');
		expect(
			scenario.graph.nodes.some((node) => node.type === 'common-review'),
		).toBe(true);
	});

	it('defines review loop scenario graph', () => {
		const scenario = agentReviewLoopWorkflow();

		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-review-feedback',
			),
		).toBe(true);
	});

	describe.skipIf(!scenarioReadyById('agent-review-accept'))(
		'runtime',
		() => {
			it.todo('accept path: review response reaches preview');
			it.todo(
				'fail path: agent reruns after review feedback, second pass accepted',
			);
		},
	);
});
