import type { EditorSelectedNodePayload } from '@langflower/shared/types/langflower-editor.js';
import type { CustomNodeRegistry } from '../palette/custom-node-registry.js';
import { toPaletteDefinition } from '../palette/palette.service.js';
import type { ResolveNodeDefinition } from '../workflow/workflow-document.js';
import type { LangflowerSession } from './langflower-session.js';

/**
 * Rich {@link EditorSelectedNodePayload} for `session.selectedNodeId` — the
 * persisted node plus its palette definition, or `node: null` when nothing
 * is selected (or the node/definition no longer resolves).
 */
export function buildSelectedNodePayload(
	session: LangflowerSession,
	resolveDefinition: ResolveNodeDefinition,
	customNodeRegistry: CustomNodeRegistry,
): EditorSelectedNodePayload {
	const node = session.activeWorkflow?.graph.nodes.find(
		(candidate) => candidate.id === session.selectedNodeId,
	);

	const definition = node !== undefined ? resolveDefinition(node) : undefined;

	return {
		node:
			node !== undefined && definition !== undefined
				? {
						...node,
						definition: toPaletteDefinition(
							definition,
							customNodeRegistry.get(node.type) !== undefined
								? 'custom'
								: 'system',
						),
					}
				: null,
	};
}
