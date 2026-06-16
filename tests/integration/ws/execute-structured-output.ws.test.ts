import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { agentStructuredOutputWorkflow } from '../helpers/scenarios/agents-mock.js';

const SCENARIO_ID = 'agent-structured-output';

describe('execute structured output (WS bridge)', () => {
	it('defines structuredOutput scenario graph', () => {
		const scenario = agentStructuredOutputWorkflow();
		const agent = scenario.graph.nodes.find(
			(node) => node.id === 'agent-1',
		);

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(agent?.params.structuredOutput).toBeDefined();
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo('invalid mock JSON → runner output error on agent node');
	});
});
