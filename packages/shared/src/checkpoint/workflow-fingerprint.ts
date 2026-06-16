import type { RuntimeEdge } from '@langflower/runtime';
import type { WorkflowNodePersisted } from '../types/langflower-workflow.js';

type FingerprintNode = Pick<WorkflowNodePersisted, 'id' | 'type'>;
type FingerprintEdge = Pick<
	RuntimeEdge,
	'fromNodeId' | 'fromPort' | 'toNodeId' | 'toPort'
>;

/**
 * Stable topology fingerprint for resume validity. Ignores positions, labels,
 * and param/input values so cosmetic edits do not invalidate a checkpoint;
 * node id/type and edge endpoints must match.
 */
export const buildWorkflowFingerprint = (
	nodes: readonly FingerprintNode[],
	edges: readonly FingerprintEdge[],
): string => {
	const nodePart = [...nodes]
		.map((node) => `${node.id}:${node.type}`)
		.sort()
		.join('|');
	const edgePart = [...edges]
		.map(
			(edge) =>
				`${edge.fromNodeId}.${edge.fromPort[0]}@${edge.fromPort[1]}->` +
				`${edge.toNodeId}.${edge.toPort[0]}@${edge.toPort[1]}`,
		)
		.sort()
		.join('|');

	return `v1:${nodePart}::${edgePart}`;
};
