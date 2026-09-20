import { getCommonReactiveNodeCatalog } from '@langflower/common-nodes';
import type { WorkflowSavePayload } from '@langflower/shared/types/langflower-workflow.js';
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

export const missingCatalogNodeTypes = (
	types: readonly string[],
): readonly string[] => {
	const catalog = getCommonReactiveNodeCatalog();

	return types.filter((type) => catalog[type] === undefined);
};

export const catalogHasNodeTypes = (types: readonly string[]): boolean =>
	missingCatalogNodeTypes(types).length === 0;

/**
 * Catalog gate for registered scenarios.
 * Unknown ids and missing catalog types throw — never skip.
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

	const missing = missingCatalogNodeTypes(scenarioNodeTypes(entry.factory()));

	if (missing.length > 0) {
		throw new Error(
			`Integration scenario ${scenarioId} uses node types ` +
				`missing from catalog: ${missing.join(', ')}. ` +
				'Remove the composer row or restore the types — do not skip.',
		);
	}

	return true;
};
