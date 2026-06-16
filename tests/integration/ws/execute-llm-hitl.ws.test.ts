import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { llmHitlFeedbackWorkflow } from '../helpers/scenarios/hitl.js';

const SCENARIO_ID = 'llm-hitl';

describe('execute LLM HITL feedback (WS bridge)', () => {
	it('defines llm-hitl feedback loop scenario graph', () => {
		const scenario = llmHitlFeedbackWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(
			scenario.graph.edges.some((edge) => edge.fromPort[0] === 'reply'),
		).toBe(true);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo('second agent invocation after HITL user reply');
		it.todo('feedback loop stays active until runner.interrupt');
	});
});
