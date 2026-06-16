import { describe, expect, it } from 'vitest';
import {
	catalogHasNodeTypes,
	scenarioNodeTypes,
	scenarioReadyById,
} from './workflow-scenario-registry.js';
import {
	WORKFLOW_SCENARIO_COMPOSER,
	workflowScenarioById,
} from './workflow-scenarios.js';

describe('WORKFLOW_SCENARIO_COMPOSER', () => {
	it('every composer id is unique and equals factory workflowId', () => {
		const seen = new Set<string>();

		for (const entry of WORKFLOW_SCENARIO_COMPOSER) {
			expect(seen.has(entry.id)).toBe(false);
			seen.add(entry.id);

			const payload = entry.factory();
			expect(payload.workflowId).toBe(entry.id);

			const byId = workflowScenarioById(entry.id);
			expect(byId?.workflowId).toBe(entry.id);
		}
	});

	it('derived node-type gates match catalog for every scenario', () => {
		for (const entry of WORKFLOW_SCENARIO_COMPOSER) {
			const types = scenarioNodeTypes(entry.factory());
			expect(types.length).toBeGreaterThan(0);
			expect(scenarioReadyById(entry.id)).toBe(
				catalogHasNodeTypes(types),
			);
		}
	});

	it('scenarioReadyById throws on unknown id', () => {
		expect(() => scenarioReadyById('__no-such-scenario__')).toThrow(
			/Unknown integration scenario id/,
		);
	});
});
