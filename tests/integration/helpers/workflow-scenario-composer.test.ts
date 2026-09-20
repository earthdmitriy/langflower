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

	it('every registered scenario is catalog-ready', () => {
		for (const entry of WORKFLOW_SCENARIO_COMPOSER) {
			const types = scenarioNodeTypes(entry.factory());
			expect(types.length).toBeGreaterThan(0);
			expect(catalogHasNodeTypes(types)).toBe(true);
			expect(scenarioReadyById(entry.id)).toBe(true);
		}
	});

	it('catalogHasNodeTypes fails for deleted palette types', () => {
		expect(catalogHasNodeTypes(['common-agent'])).toBe(false);
		expect(catalogHasNodeTypes(['common-dialog'])).toBe(false);
		expect(catalogHasNodeTypes(['common-throw'])).toBe(false);
		expect(catalogHasNodeTypes(['common-triple'])).toBe(false);
	});

	it('scenarioReadyById throws on unknown id', () => {
		expect(() => scenarioReadyById('__no-such-scenario__')).toThrow(
			/Unknown integration scenario id/,
		);
	});
});
