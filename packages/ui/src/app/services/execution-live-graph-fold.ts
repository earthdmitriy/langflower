import type { RuntimeEdge } from '@langflower/runtime';
import type {
	WorkflowCurrentSnapshotPayload,
	WorkflowNodePersisted,
	WorkflowPersistedGraph,
} from '@langflower/shared/langflower';
import { merge, type Observable } from 'rxjs';
import { filter, map, scan, shareReplay, startWith } from 'rxjs/operators';

type LiveGraphAction =
	| {
			readonly type: 'snapshot';
			readonly graph: WorkflowPersistedGraph | null;
	  }
	| {
			readonly type: 'upsertNodes';
			readonly nodes: readonly WorkflowNodePersisted[];
	  }
	| { readonly type: 'deleteNodes'; readonly nodeIds: readonly string[] }
	| { readonly type: 'addEdges'; readonly edges: readonly RuntimeEdge[] }
	| { readonly type: 'deleteEdges'; readonly edgeIds: readonly string[] };

const upsertNodes = (
	nodes: readonly WorkflowNodePersisted[],
	updates: readonly WorkflowNodePersisted[],
): readonly WorkflowNodePersisted[] => {
	const byId = new Map(updates.map((node) => [node.id, node]));
	const replaced = new Set<string>();
	const next = nodes.map((node) => {
		const updated = byId.get(node.id);
		if (updated === undefined) {
			return node;
		}
		replaced.add(node.id);
		return updated;
	});

	for (const node of updates) {
		if (!replaced.has(node.id)) {
			next.push(node);
		}
	}

	return next;
};

const foldLiveGraph = (
	state: WorkflowPersistedGraph | null,
	action: LiveGraphAction,
): WorkflowPersistedGraph | null => {
	if (action.type === 'snapshot') {
		return action.graph;
	}

	if (state === null) {
		return state;
	}

	if (action.type === 'upsertNodes') {
		if (action.nodes.length === 0) {
			return state;
		}
		return { ...state, nodes: upsertNodes(state.nodes, action.nodes) };
	}

	if (action.type === 'deleteNodes') {
		if (action.nodeIds.length === 0) {
			return state;
		}
		const removed = new Set(action.nodeIds);
		return {
			...state,
			nodes: state.nodes.filter((node) => !removed.has(node.id)),
		};
	}

	if (action.type === 'addEdges') {
		if (action.edges.length === 0) {
			return state;
		}
		const existing = new Set(state.edges.map((edge) => edge.edgeId));
		const added = action.edges.filter((edge) => !existing.has(edge.edgeId));
		if (added.length === 0) {
			return state;
		}
		return { ...state, edges: [...state.edges, ...added] };
	}

	if (action.edgeIds.length === 0) {
		return state;
	}
	const removed = new Set(action.edgeIds);
	return {
		...state,
		edges: state.edges.filter((edge) => !removed.has(edge.edgeId)),
	};
};

/**
 * Live persisted graph: `workflow.current.snapshot` replace plus
 * `editor.updateNodes` / add / delete deltas (same facts the canvas applies).
 */
export const createLiveGraph$ = (deps: {
	readonly workflowSnapshot$: Observable<WorkflowCurrentSnapshotPayload>;
	readonly addNodes$: Observable<readonly WorkflowNodePersisted[]>;
	readonly updateNodes$: Observable<readonly WorkflowNodePersisted[]>;
	readonly deleteNodes$: Observable<readonly WorkflowNodePersisted[]>;
	readonly addEdges$: Observable<readonly RuntimeEdge[]>;
	readonly deleteEdges$: Observable<readonly RuntimeEdge[]>;
}): Observable<WorkflowPersistedGraph | null> => {
	const snapshot$ = deps.workflowSnapshot$.pipe(
		map((snap): LiveGraphAction => ({
			type: 'snapshot',
			graph: snap.activeWorkflow?.graph ?? null,
		})),
	);
	const upsertNodes$ = merge(deps.addNodes$, deps.updateNodes$).pipe(
		filter((nodes) => nodes.length > 0),
		map((nodes): LiveGraphAction => ({
			type: 'upsertNodes',
			nodes,
		})),
	);
	const deleteNodes$ = deps.deleteNodes$.pipe(
		filter((nodes) => nodes.length > 0),
		map((nodes): LiveGraphAction => ({
			type: 'deleteNodes',
			nodeIds: nodes.map((node) => node.id),
		})),
	);
	const addEdges$ = deps.addEdges$.pipe(
		filter((edges) => edges.length > 0),
		map((edges): LiveGraphAction => ({
			type: 'addEdges',
			edges,
		})),
	);
	const deleteEdges$ = deps.deleteEdges$.pipe(
		filter((edges) => edges.length > 0),
		map((edges): LiveGraphAction => ({
			type: 'deleteEdges',
			edgeIds: edges.map((edge) => edge.edgeId),
		})),
	);

	return merge(
		snapshot$,
		upsertNodes$,
		deleteNodes$,
		addEdges$,
		deleteEdges$,
	).pipe(
		scan(foldLiveGraph, null as WorkflowPersistedGraph | null),
		startWith(null as WorkflowPersistedGraph | null),
		shareReplay({ bufferSize: 1, refCount: false }),
	);
};
