import type {
	WorkflowLoadedPayload,
	WorkflowNodePersisted,
} from '@langflower/shared/langflower.js';

export type NodeRegistryDisplayName = (
	node: Pick<WorkflowNodePersisted, 'type' | 'params'>,
) => string | undefined;

/**
 * Human node title for CLI last-event lines.
 * Canvas `ui.label` wins; else palette `displayName`; else registry `type`.
 * Unknown ids stay as-is (do not invent a name).
 */
export const workflowNodeDisplayName = (
	workflow: WorkflowLoadedPayload | null,
	nodeId: string,
	registryDisplayName: NodeRegistryDisplayName,
): string => {
	const node = workflow?.graph.nodes.find((entry) => entry.id === nodeId);
	if (node === undefined) {
		return nodeId;
	}
	const label = node.ui.label?.trim() ?? '';
	if (label.length > 0) {
		return label;
	}
	const displayName = registryDisplayName(node)?.trim() ?? '';
	if (displayName.length > 0) {
		return displayName;
	}
	return node.type;
};
