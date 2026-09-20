import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import { getCommonReactiveNode } from './catalog.js';

/**
 * Persisted node identity for catalog lookup. Lookup is still keyed by
 * `type`; `params` is threaded so instance-aware ports can read it without
 * a second mapper. Common-nodes must not import `@langflower/shared`.
 */
export type ResolveWorkflowNodeInstance = {
	readonly type: string;
	readonly params: Readonly<Record<string, unknown>>;
};

/** Resolve a persisted workflow node to a reactive runtime definition. */
export const resolveWorkflowNodeDefinition = (
	node: ResolveWorkflowNodeInstance,
): ReactiveNodeDefinition | undefined => getCommonReactiveNode(node.type);
