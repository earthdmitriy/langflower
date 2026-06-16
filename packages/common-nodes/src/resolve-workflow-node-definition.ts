import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import { getCommonReactiveNode } from './catalog.js';

/** Persisted workflow node identity for catalog lookup (type only). */
export type ResolveWorkflowNodeInstance = {
	readonly type: string;
};

/** Resolve a persisted workflow node type to a reactive runtime definition. */
export const resolveWorkflowNodeDefinition = (
	node: ResolveWorkflowNodeInstance,
): ReactiveNodeDefinition | undefined => getCommonReactiveNode(node.type);
