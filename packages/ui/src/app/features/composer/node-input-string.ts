import type { WorkflowPersistedGraph } from '@langflower/shared/langflower';

/** Graph `node.inputs[portId]` as a string — same SSOT as canvas / inspector. */
export const nodeInputString = (
	graph: WorkflowPersistedGraph | null,
	nodeId: string,
	portId: string,
): string => {
	const stored = graph?.nodes.find((node) => node.id === nodeId)?.inputs[
		portId
	];

	return typeof stored === 'string' ? stored : '';
};
