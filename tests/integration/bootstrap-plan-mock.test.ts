import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from './helpers/workflow-scenario-registry.js';
import { agentPlanReadWorkflow } from './helpers/scenarios/agents-mock.js';

const SCENARIO_ID = 'agent-plan-read';

describe('bootstrap plan mock (integration)', () => {
	it('defines plan agent scenario for bootstrap + mock script', () => {
		const scenario = agentPlanReadWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(
			scenario.graph.nodes.some(
				(node) => node.type === 'common-agent-plan',
			),
		).toBe(true);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo(
			'seed plan.json + mock-llm.json → workflow.load + runner.start → done',
		);
	});
});
