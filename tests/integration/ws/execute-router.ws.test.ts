import { describe, expect, it } from 'vitest';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { routerTwoChannelsWorkflow } from '../helpers/scenarios/smoke.js';

const SCENARIO_ID = 'router-two-channels';

describe('execute router (WS bridge)', () => {
	it('defines router-two-channels scenario graph', () => {
		const scenario = routerTwoChannelsWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(
			scenario.graph.nodes.some((node) => node.type === 'common-router'),
		).toBe(true);
		expect(scenario.graph.edges).toHaveLength(4);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		it.todo(
			'global run: preview-a="alpha", preview-b="beta" (runner.output-emitted)',
		);
		it.todo(
			'partial startNode rerun when one string input changes (cluster rerun)',
		);
	});
});
