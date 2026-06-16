import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { tripleEmitWorkflow } from '../helpers/scenarios/smoke.js';

const SCENARIO_ID = 'triple-emit';

describe('execute triple (WS bridge)', () => {
	it('defines triple-emit scenario graph', () => {
		const scenario = tripleEmitWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(
			scenario.graph.nodes.some((node) => node.type === 'common-triple'),
		).toBe(true);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo(
			'emits three preview values before runner.done (runner.output-emitted)',
		);
	});
});
