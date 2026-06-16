import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { llmHitlOnceWorkflow } from '../helpers/scenarios/hitl.js';

const SCENARIO_ID = 'llm-hitl-once';

describe('execute HITL complete (WS bridge)', () => {
	it('defines one-shot HITL scenario graph', () => {
		const scenario = llmHitlOnceWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(
			scenario.graph.edges.every((edge) => edge.fromPort[0] !== 'reply'),
		).toBe(true);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo('user reply completes run — runner.done without feedback edge');
	});
});
