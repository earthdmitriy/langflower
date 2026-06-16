import type {
	WorkflowLoadFailedCode,
	WorkflowLoadedPayload,
} from '@langflower/shared/langflower.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { bindWorkflowToSessionEditor } from './apply-editor-mutation.js';
import type { ResolveNodeDefinition } from './workflow-document.js';

type ActivateWorkflowOptions = {
	readonly dirty: boolean;
};

export type ActivateWorkflowResult =
	| {
			readonly ok: true;
			readonly droppedNodeIds: readonly string[];
			readonly droppedEdgeIds: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly code: WorkflowLoadFailedCode;
			readonly message: string;
	  };

const asLoadFailedCode = (code: string): WorkflowLoadFailedCode => {
	switch (code) {
		case 'NOT_FOUND':
		case 'INVALID_GRAPH':
		case 'UNSUPPORTED_NODE':
		case 'INVALID_EDGE':
		case 'GRAPH_LOCKED':
		case 'BIND_FAILED':
			return code;
		default:
			return 'BIND_FAILED';
	}
};

/**
 * Align persisted graph with what the editor actually bound (after soft skips).
 */
const documentMatchingEditor = (
	document: WorkflowLoadedPayload,
	session: LangflowerSession,
): WorkflowLoadedPayload => {
	const boundNodeIds = new Set(
		session.runtime.editor.getNodes().map((node) => node.nodeId as string),
	);

	return {
		...document,
		graph: {
			...document.graph,
			nodes: document.graph.nodes.filter((node) =>
				boundNodeIds.has(node.id),
			),
			edges: [...session.runtime.editor.getEdges()],
		},
	};
};

/**
 * Composer: bind runtime editor from document → assign session document →
 * mark dirty/pristine. Load path (document → editor); live edits sync the
 * inverse via syncActiveWorkflowTopologyFromEditor after editor mutations.
 * Call order is explicit here; steps do not call each other.
 *
 * On bind failure, re-binds the previous active document when present so the
 * live editor stays aligned with `session.activeWorkflow`.
 */
export const activateWorkflowInSession = (
	session: LangflowerSession,
	projectDir: string,
	document: WorkflowLoadedPayload,
	options: ActivateWorkflowOptions,
	resolveDefinition: ResolveNodeDefinition,
): ActivateWorkflowResult => {
	const previousDocument = session.activeWorkflow;

	// 1. Bind graph into the runtime editor (soft-skip unsupported / invalid)
	const bindResult = bindWorkflowToSessionEditor(
		session.runtime.editor,
		projectDir,
		document,
		resolveDefinition,
	);

	if (!bindResult.ok) {
		if (previousDocument !== null) {
			bindWorkflowToSessionEditor(
				session.runtime.editor,
				projectDir,
				previousDocument,
				resolveDefinition,
			);
		}

		return {
			ok: false,
			code: asLoadFailedCode(bindResult.code),
			message: bindResult.message,
		};
	}

	const droppedNodeIds = bindResult.droppedNodeIds;
	const droppedEdgeIds = bindResult.droppedEdgeIds;
	const bindDropped = droppedNodeIds.length > 0 || droppedEdgeIds.length > 0;

	// 2. Assign session document (graph matches editor after soft skips)
	const nextDocument = bindDropped
		? documentMatchingEditor(document, session)
		: document;
	session.activeWorkflow = nextDocument;
	session.activeWorkflowId = nextDocument.workflowId;

	// 3. Dirty when caller asked or bind stripped anything
	if (options.dirty || bindDropped) {
		session.markDirty();
	} else {
		session.markPristine();
	}

	return { ok: true, droppedNodeIds, droppedEdgeIds };
};
