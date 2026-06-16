import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { llmHitlOnceWorkflow } from '../helpers/scenarios/hitl.js';

const SCENARIO_ID = 'llm-hitl-once';

describe('execute simple LLM (WS bridge)', () => {
	it('defines llm-hitl-once scenario graph', () => {
		const scenario = llmHitlOnceWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(
			scenario.graph.nodes.some((node) => node.type === 'common-agent'),
		).toBe(true);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo('string → mock agent → runner.done (terminal completed)');
	});
});
