import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import type { WorkflowLoadedPayload } from '@langflower/shared/langflower.js';
import type { ResolveNodeDefinition } from './workflow-document.js';

/**
 * Persisted `node.inputs` hold visible UI overrides only (ADR-028).
 * Wire-only / preview ports and values equal to the current definition
 * `defaultValue` must not be written to disk. Hidden ports with an
 * editable `inline` still persist (Chat Input `message`).
 */

const valuesEqual = (left: unknown, right: unknown): boolean =>
	JSON.stringify(left) === JSON.stringify(right);

const isPreviewInline = (inline: unknown): boolean => {
	if (
		inline === 'preview' ||
		inline === 'preview-markdown' ||
		inline === 'preview-code'
	) {
		return true;
	}

	if (typeof inline === 'object' && inline !== null && 'type' in inline) {
		const type = (inline as { readonly type: unknown }).type;
		return (
			type === 'preview' ||
			type === 'preview-markdown' ||
			type === 'preview-code'
		);
	}

	return false;
};

/** Editable inline field (canvas / inspector), including hidden+inline. */
const hasVisibleUiInputField = (config: {
	readonly inline?: unknown;
}): boolean => config.inline !== undefined && !isPreviewInline(config.inline);

/**
 * Keep only persistable overrides: visible UI field and value !== current
 * definition defaultValue.
 */
export const prunePersistedInputs = (
	inputs: Readonly<Record<string, unknown>>,
	definition: ReactiveNodeDefinition,
): Readonly<Record<string, unknown>> => {
	const next: Record<string, unknown> = {};

	for (const [portId, value] of Object.entries(inputs)) {
		const config = definition.inputsConfigs.find(
			(entry) => entry.portId === portId,
		);

		if (config === undefined || typeof config.portId !== 'string') {
			continue;
		}

		if (!hasVisibleUiInputField(config)) {
			continue;
		}

		if (typeof value === 'string' && value.trim() === '') {
			continue;
		}

		if (
			config.defaultValue !== undefined &&
			valuesEqual(value, config.defaultValue)
		) {
			continue;
		}

		next[portId] = value;
	}

	return next;
};

/**
 * Strip non-persistable input keys from every node (unknown ports, hidden /
 * wire-only, default-equal). Structural validate stays separate.
 */
export const normalizeWorkflowDocumentInputs = (
	document: WorkflowLoadedPayload,
	resolveDefinition: ResolveNodeDefinition,
): WorkflowLoadedPayload => ({
	...document,
	graph: {
		...document.graph,
		nodes: document.graph.nodes.map((node) => {
			const definition = resolveDefinition(node);

			if (definition === undefined) {
				return node;
			}

			const inputs = prunePersistedInputs(node.inputs, definition);

			if (
				Object.keys(inputs).length ===
					Object.keys(node.inputs).length &&
				Object.keys(inputs).every((key) =>
					valuesEqual(inputs[key], node.inputs[key]),
				)
			) {
				return node;
			}

			return { ...node, inputs };
		}),
	},
});
