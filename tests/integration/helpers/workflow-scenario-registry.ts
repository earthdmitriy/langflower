import { getCommonReactiveNodeCatalog } from '@langflower/common-nodes';
import type { WorkflowSavePayload } from '@langflower/shared/langflower.js';
import {
	WORKFLOW_SCENARIO_COMPOSER,
	type WorkflowScenarioComposerEntry,
} from './workflow-scenarios.js';

export type { WorkflowScenarioComposerEntry };

/** Distinct node types present in a scenario graph (catalog gate input). */
export const scenarioNodeTypes = (
	payload: WorkflowSavePayload,
): readonly string[] => [
	...new Set(payload.graph.nodes.map((node) => node.type)),
];

export const catalogHasNodeTypes = (types: readonly string[]): boolean => {
	const catalog = getCommonReactiveNodeCatalog();

	return types.every((type) => catalog[type] !== undefined);
};

export const scenarioReady = (entry: WorkflowScenarioComposerEntry): boolean =>
	catalogHasNodeTypes(scenarioNodeTypes(entry.factory()));

/**
 * Catalog gate for `describe.skipIf(!scenarioReadyById(id))`.
 * Unknown ids throw — never treat “missing row” as “not ready” (permanent skip).
 * Id must match `WORKFLOW_SCENARIO_COMPOSER` / factory `workflowId`.
 */
export const scenarioReadyById = (scenarioId: string): boolean => {
	const entry = WORKFLOW_SCENARIO_COMPOSER.find(
		(candidate) => candidate.id === scenarioId,
	);

	if (entry === undefined) {
		throw new Error(
			`Unknown integration scenario id: ${scenarioId}. ` +
				'Add it to WORKFLOW_SCENARIO_COMPOSER ' +
				'(id must equal factory workflowId).',
		);
	}

	return scenarioReady(entry);
};
