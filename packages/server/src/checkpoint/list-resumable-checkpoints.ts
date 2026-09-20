import { buildWorkflowFingerprint } from '@langflower/shared/checkpoint/workflow-fingerprint.js';
import type { WorkflowCheckpointSummary } from '@langflower/shared/types/workflow-checkpoint.js';
import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import type { WorkflowCheckpointStore } from './workflow-checkpoint-store.js';

/** List resumable checkpoints, marking fingerprint mismatches as stale. */
export const listResumableCheckpoints = async (
	store: WorkflowCheckpointStore,
	workflowId: string | null,
	workflow: WorkflowLoadedPayload | null,
): Promise<readonly WorkflowCheckpointSummary[]> => {
	if (workflowId === null) {
		return [];
	}

	const fingerprint =
		workflow !== null
			? buildWorkflowFingerprint(
					workflow.graph.nodes,
					workflow.graph.edges,
				)
			: undefined;

	return store.listResumable(workflowId, fingerprint);
};
