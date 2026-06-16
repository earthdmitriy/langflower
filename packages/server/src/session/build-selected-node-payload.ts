import type { EditorSelectedNodePayload } from '@langflower/shared/langflower.js';
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
): EditorSelectedNodePayload {
	const node = session.activeWorkflow?.graph.nodes.find(
		(candidate) => candidate.id === session.selectedNodeId,
	);

	const definition =
		node !== undefined
			? resolveDefinition({ type: node.type, params: node.params })
			: undefined;

	return {
		node:
			node !== undefined && definition !== undefined
				? {
						...node,
						definition: toPaletteDefinition(definition, 'system'),
					}
				: null,
	};
}
