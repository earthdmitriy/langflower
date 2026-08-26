import type { EdgeId, NodeId, RuntimeEdge } from '@langflower/runtime';
import type {
	WorkflowCurrentSnapshotPayload,
	WorkflowNodePersisted,
	WorkflowPersistedGraph,
} from '@langflower/shared/langflower';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createLiveGraph$ } from '../execution-live-graph-fold.js';

const viewport = { x: 0, y: 0, scale: 1 };

const chatNode = (message: string): WorkflowNodePersisted => ({
	id: 'chat',
	type: 'common-chat-input',
	params: {},
	inputs: message === '' ? {} : { message },
	ui: { position: { x: 0, y: 0 } },
});

const graphOf = (
	nodes: readonly WorkflowNodePersisted[],
	edges: readonly RuntimeEdge[] = [],
): WorkflowPersistedGraph => ({
	viewport,
	nodes,
	edges,
});

const snapshotOf = (
	graph: WorkflowPersistedGraph | null,
): WorkflowCurrentSnapshotPayload => ({
	activeWorkflow:
		graph === null
			? null
			: {
					workflowId: 'wf',
					metadata: {
						name: 'wf',
						createdAt: '0',
						updatedAt: '0',
					},
					graph,
				},
	currentStatus: { status: 'pristine' },
});

const edge = (edgeId: string): RuntimeEdge => ({
	edgeId: edgeId as EdgeId,
	fromNodeId: 'chat' as NodeId,
	fromPort: ['message', 0],
	toNodeId: 'preview' as NodeId,
	toPort: ['text', 0],
});

describe('createLiveGraph$', () => {
	it('applies editor.updateNodes inputs after a snapshot', () => {
		const workflowSnapshot$ = new Subject<WorkflowCurrentSnapshotPayload>();
		const addNodes$ = new Subject<readonly WorkflowNodePersisted[]>();
		const updateNodes$ = new Subject<readonly WorkflowNodePersisted[]>();
		const deleteNodes$ = new Subject<readonly WorkflowNodePersisted[]>();
		const addEdges$ = new Subject<readonly RuntimeEdge[]>();
		const deleteEdges$ = new Subject<readonly RuntimeEdge[]>();
		const graphs: (WorkflowPersistedGraph | null)[] = [];
		const subscription = createLiveGraph$({
			workflowSnapshot$,
			addNodes$,
			updateNodes$,
			deleteNodes$,
			addEdges$,
			deleteEdges$,
		}).subscribe((graph) => graphs.push(graph));

		workflowSnapshot$.next(snapshotOf(graphOf([chatNode('')])));
		updateNodes$.next([chatNode('typed')]);

		expect(
			graphs.at(-1)?.nodes.find((node) => node.id === 'chat')?.inputs,
		).toEqual({ message: 'typed' });

		subscription.unsubscribe();
	});

	it('replaces the graph on a new snapshot', () => {
		const workflowSnapshot$ = new Subject<WorkflowCurrentSnapshotPayload>();
		const addNodes$ = new Subject<readonly WorkflowNodePersisted[]>();
		const updateNodes$ = new Subject<readonly WorkflowNodePersisted[]>();
		const deleteNodes$ = new Subject<readonly WorkflowNodePersisted[]>();
		const addEdges$ = new Subject<readonly RuntimeEdge[]>();
		const deleteEdges$ = new Subject<readonly RuntimeEdge[]>();
		const graphs: (WorkflowPersistedGraph | null)[] = [];
		const subscription = createLiveGraph$({
			workflowSnapshot$,
			addNodes$,
			updateNodes$,
			deleteNodes$,
			addEdges$,
			deleteEdges$,
		}).subscribe((graph) => graphs.push(graph));

		workflowSnapshot$.next(snapshotOf(graphOf([chatNode('typed')])));
		workflowSnapshot$.next(snapshotOf(graphOf([chatNode('')])));

		expect(
			graphs.at(-1)?.nodes.find((node) => node.id === 'chat')?.inputs,
		).toEqual({});

		subscription.unsubscribe();
	});

	it('adds and removes nodes and edges', () => {
		const workflowSnapshot$ = new Subject<WorkflowCurrentSnapshotPayload>();
		const addNodes$ = new Subject<readonly WorkflowNodePersisted[]>();
		const updateNodes$ = new Subject<readonly WorkflowNodePersisted[]>();
		const deleteNodes$ = new Subject<readonly WorkflowNodePersisted[]>();
		const addEdges$ = new Subject<readonly RuntimeEdge[]>();
		const deleteEdges$ = new Subject<readonly RuntimeEdge[]>();
		const graphs: (WorkflowPersistedGraph | null)[] = [];
		const subscription = createLiveGraph$({
			workflowSnapshot$,
			addNodes$,
			updateNodes$,
			deleteNodes$,
			addEdges$,
			deleteEdges$,
		}).subscribe((graph) => graphs.push(graph));

		workflowSnapshot$.next(snapshotOf(graphOf([chatNode('')])));
		addEdges$.next([edge('e1')]);
		expect(graphs.at(-1)?.edges).toHaveLength(1);

		deleteEdges$.next([edge('e1')]);
		expect(graphs.at(-1)?.edges).toEqual([]);

		const extra: WorkflowNodePersisted = {
			id: 'preview',
			type: 'common-preview',
			params: {},
			inputs: {},
			ui: { position: { x: 100, y: 0 } },
		};
		addNodes$.next([extra]);
		expect(graphs.at(-1)?.nodes.map((node) => node.id)).toEqual([
			'chat',
			'preview',
		]);

		deleteNodes$.next([extra]);
		expect(graphs.at(-1)?.nodes.map((node) => node.id)).toEqual(['chat']);

		subscription.unsubscribe();
	});
});
