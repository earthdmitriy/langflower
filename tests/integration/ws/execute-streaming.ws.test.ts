import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { llmHitlFeedbackWorkflow } from '../helpers/scenarios/hitl.js';

const SCENARIO_ID = 'llm-hitl';

describe('execute LLM streaming (WS bridge)', () => {
	it('defines streaming scenario graph (llm-hitl chain)', () => {
		const scenario = llmHitlFeedbackWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo(
			'mock streams thoughts + response chunks via runner.output-emitted',
		);
	});
});
