import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { simpleHitlPreviewWorkflow } from '../helpers/scenarios/hitl.js';

const SCENARIO_ID = 'simple';

describe('execute simple bootstrap HITL (WS bridge)', () => {
	it('defines simple HITL preview scenario graph', () => {
		const scenario = simpleHitlPreviewWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(
			scenario.graph.nodes.some((node) => node.type === 'common-dialog'),
		).toBe(true);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo('run pauses on HITL — runner stays active, no runner.done');
		it.todo('runner.input-received on dialog question port');
	});
});
