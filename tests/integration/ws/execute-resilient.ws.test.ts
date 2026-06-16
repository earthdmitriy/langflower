import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { throwPreviewWorkflow } from '../helpers/scenarios/smoke.js';

const SCENARIO_ID = 'throw-preview';

describe('execute resilient / throw (WS bridge)', () => {
	it('defines throw-preview scenario graph', () => {
		const scenario = throwPreviewWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(
			scenario.graph.nodes.some((node) => node.type === 'common-throw'),
		).toBe(true);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo('run ends with errors — preview never receives throw output');
		it.todo('runner telemetry includes output error on throw node port');
	});
});
