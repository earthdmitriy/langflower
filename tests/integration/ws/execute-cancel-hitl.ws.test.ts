import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { llmHitlOnceWorkflow } from '../helpers/scenarios/hitl.js';

const SCENARIO_ID = 'llm-hitl-once';

describe('execute cancel during HITL (WS bridge)', () => {
	it('defines HITL cancel scenario graph', () => {
		expect(llmHitlOnceWorkflow().workflowId).toBe(SCENARIO_ID);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo('runner.interrupt during awaiting_input cancels run');
		it.todo('late HITL reply rejected after interrupt');
	});
});
