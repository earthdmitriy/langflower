import { getCommonReactiveNode } from '@langflower/common-nodes';
import type { WorkflowLoadedPayload } from '@langflower/shared/langflower.js';

type CheckpointBoundary = {
	readonly createCheckpoint: true;
	readonly label?: string;
};

/**
 * Resolve whether an output emission is an explicit checkpoint boundary
 * (`createCheckpoint` on output meta, e.g. `common-checkpoint`).
 */
export const resolveCheckpointBoundary = (
	workflow: WorkflowLoadedPayload,
	nodeId: string,
	portId: string,
): CheckpointBoundary | undefined => {
	const node = workflow.graph.nodes.find((entry) => entry.id === nodeId);
	if (node === undefined) {
		return undefined;
	}

	const definition = getCommonReactiveNode(node.type);
	const portMeta = definition?.outputsConfigs.find(
		(port) => port.portId === portId,
	);
	if (portMeta?.createCheckpoint !== true) {
		return undefined;
	}

	const inputLabel = node.inputs['label'];
	const fromInputs =
		typeof inputLabel === 'string' && inputLabel.trim().length > 0
			? inputLabel.trim()
			: undefined;
	const fromMeta =
		typeof portMeta.checkpointLabel === 'string' &&
		portMeta.checkpointLabel.trim().length > 0
			? portMeta.checkpointLabel.trim()
			: undefined;
	const fromUi =
		typeof node.ui.label === 'string' && node.ui.label.trim().length > 0
			? node.ui.label.trim()
			: undefined;

	const label = fromInputs ?? fromMeta ?? fromUi;

	return label !== undefined
		? { createCheckpoint: true, label }
		: { createCheckpoint: true };
};
