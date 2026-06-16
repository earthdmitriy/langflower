import type { RuntimeEdge } from '@langflower/runtime';
import type {
	CanvasViewport,
	EditorAddEdgeRequestedPayload,
	EditorAddNodeRequestedPayload,
	EditorPasteRequestedPayload,
	EditorSelectedNodePayload,
	EditorSelectNodeRequestedPayload,
	EditorUpdateNodeRequestedPayload,
	RunnerPermissionAskPayload,
	WorkflowCurrentSnapshotPayload,
	WorkflowLoadPayload,
	WorkflowLoadedPayload,
	WorkflowNodePersisted,
	WorkflowSavePayload,
} from '@langflower/shared/langflower.js';
import { langflowerWsConfig } from '@langflower/shared/langflower.js';
import type { LangflowerWsClient } from '@langflower/shared/langflower-ws-waits';
import {
	requestWorkflowLoad,
	waitForRunnerOutput,
} from '@langflower/shared/langflower-ws-waits';
import { createClient } from '@langflower/websocket-bridge/create-client';
import { filter, firstValueFrom, take, type Subscription } from 'rxjs';
import { writeWorkflowDocument } from '../helpers/temp-project.js';

export type { LangflowerWsClient };

/**
 * Auto-Allow every runtime `permission.ask` (CI fake pilots).
 * Call before starting a run that invokes ask-gated harness tools.
 */
export const autoAllowPermissions = (
	client: LangflowerWsClient,
): Subscription =>
	client['runner.permission.ask'].subscribe(
		(ask: RunnerPermissionAskPayload) => {
			client['runner.permission.reply'].next({
				runId: ask.runId,
				askId: ask.askId,
				decision: 'allow',
			});
		},
	);

export const createLangflowerWsClient = (wsUrl: string): LangflowerWsClient =>
	createClient(langflowerWsConfig, { url: wsUrl });

export const waitViewportSnapshot = async (
	client: LangflowerWsClient,
): Promise<WorkflowCurrentSnapshotPayload> => {
	const snapshotPromise = firstValueFrom(
		client['workflow.current.snapshot'].pipe(
			filter((s) => s.activeWorkflow !== null),
			take(1),
		),
	);
	const readyPromise = firstValueFrom(client['session.ready'].pipe(take(1)));

	await firstValueFrom(
		client.status$.pipe(
			filter((status) => status === 'connected'),
			take(1),
		),
	);

	const [snapshot] = await Promise.all([snapshotPromise, readyPromise]);
	return snapshot;
};

export const seedWorkflowFromDisk = async (
	client: LangflowerWsClient,
	projectDir: string,
	payload: WorkflowSavePayload,
): Promise<WorkflowLoadedPayload> => {
	await writeWorkflowDocument(projectDir, payload);
	return requestWorkflowLoad(client, {
		workflowId: payload.workflowId,
	});
};

/**
 * Subscribe to runner telemetry before sending start — events$ is hot (no replay).
 */
export const runAndWaitForOutput = async (
	client: LangflowerWsClient,
	match: {
		readonly nodeId: string;
		readonly portId: string;
		readonly predicate?: (value: unknown) => boolean;
	},
	start: () => void,
): Promise<{
	readonly runId: string;
	readonly output: Awaited<ReturnType<typeof waitForRunnerOutput>>;
}> => {
	const outputPromise = waitForRunnerOutput(client, match);
	const runIdPromise = firstValueFrom(client['runner.started'].pipe(take(1)));

	start();

	const [runId, output] = await Promise.all([runIdPromise, outputPromise]);

	return { runId, output };
};

export const runFullGraphAndWaitForOutput = async (
	client: LangflowerWsClient,
	match: {
		readonly nodeId: string;
		readonly portId: string;
		readonly predicate?: (value: unknown) => boolean;
	},
): Promise<{
	readonly runId: string;
	readonly output: Awaited<ReturnType<typeof waitForRunnerOutput>>;
}> =>
	runAndWaitForOutput(client, match, () => {
		client['runner.start.requested'].next([]);
	});

export const runFromNodeAndWaitForOutput = async (
	client: LangflowerWsClient,
	nodeId: string,
	match: {
		readonly nodeId: string;
		readonly portId: string;
		readonly predicate?: (value: unknown) => boolean;
	},
): Promise<{
	readonly runId: string;
	readonly output: Awaited<ReturnType<typeof waitForRunnerOutput>>;
}> => {
	const outputPromise = waitForRunnerOutput(client, match);
	const runIdPromise = firstValueFrom(
		client['runner.startNode.started'].pipe(take(1)),
	);

	client['runner.startNode.requested'].next([nodeId]);

	const [runId, output] = await Promise.all([runIdPromise, outputPromise]);

	return { runId, output };
};

export const expectWorkflowLoadKeepsActiveId = async (
	client: LangflowerWsClient,
	payload: WorkflowLoadPayload,
	expectedActiveId: string,
): Promise<WorkflowCurrentSnapshotPayload> => {
	const snapshot$ = firstValueFrom(
		client['workflow.current.snapshot'].pipe(take(1)),
	);

	client['workflow.load.requested'].next(payload);

	const snapshot = await snapshot$;

	if (snapshot.activeWorkflow?.workflowId !== expectedActiveId) {
		throw new Error(
			`expected active workflow ${expectedActiveId}, got ${snapshot.activeWorkflow?.workflowId ?? 'null'}`,
		);
	}

	return snapshot;
};

export const emitEditorViewport = async (
	client: LangflowerWsClient,
	payload: CanvasViewport,
): Promise<CanvasViewport> => {
	const delta$ = firstValueFrom(
		client['editor.viewport.delta'].pipe(take(1)),
	);
	client['editor.viewport.requested'].next(payload);
	return delta$;
};

export const waitEditorViewportDelta = async (
	client: LangflowerWsClient,
): Promise<CanvasViewport> =>
	firstValueFrom(client['editor.viewport.delta'].pipe(take(1)));

export const emitEditorSelectNode = async (
	client: LangflowerWsClient,
	payload: EditorSelectNodeRequestedPayload,
): Promise<EditorSelectedNodePayload> => {
	const selected$ = firstValueFrom(
		client['editor.nodeSelected'].pipe(take(1)),
	);
	client['editor.selectNode.requested'].next(payload);
	return selected$;
};

export const waitEditorNodeSelected = async (
	client: LangflowerWsClient,
	predicate?: (payload: EditorSelectedNodePayload) => boolean,
): Promise<EditorSelectedNodePayload> =>
	firstValueFrom(
		client['editor.nodeSelected'].pipe(
			filter(predicate ?? (() => true)),
			take(1),
		),
	);

export const emitEditorAddNode = async (
	client: LangflowerWsClient,
	payload: EditorAddNodeRequestedPayload,
): Promise<readonly WorkflowNodePersisted[]> => {
	const settled$ = firstValueFrom(
		client['editor.addNodes'].pipe(
			filter((nodes) => nodes.length > 0),
			take(1),
		),
	);
	client['editor.addNode.requested'].next(payload);
	return settled$;
};

export const emitEditorUpdateNode = async (
	client: LangflowerWsClient,
	payload: EditorUpdateNodeRequestedPayload,
): Promise<readonly WorkflowNodePersisted[]> => {
	const settled$ = firstValueFrom(
		client['editor.updateNodes'].pipe(
			filter((nodes) => nodes.length > 0),
			take(1),
		),
	);
	client['editor.updateNode.requested'].next(payload);
	return settled$;
};

export const emitEditorAddEdge = async (
	client: LangflowerWsClient,
	payload: EditorAddEdgeRequestedPayload,
): Promise<readonly RuntimeEdge[]> => {
	const settled$ = firstValueFrom(
		client['editor.addEdges'].pipe(
			filter((edges) => edges.length > 0),
			take(1),
		),
	);
	client['editor.addEdge.requested'].next(payload);
	return settled$;
};

export const emitEditorPaste = async (
	client: LangflowerWsClient,
	payload: EditorPasteRequestedPayload,
): Promise<{
	readonly nodes: readonly WorkflowNodePersisted[];
	readonly edges: readonly RuntimeEdge[];
}> => {
	const nodes$ = firstValueFrom(
		client['editor.addNodes'].pipe(
			filter((nodes) => nodes.length > 0),
			take(1),
		),
	);
	const edges$ =
		payload.edges.length === 0
			? Promise.resolve([] as readonly RuntimeEdge[])
			: firstValueFrom(
					client['editor.addEdges'].pipe(
						filter((edges) => edges.length > 0),
						take(1),
					),
				);

	client['editor.paste.requested'].next(payload);

	const [nodes, edges] = await Promise.all([nodes$, edges$]);
	return { nodes, edges };
};

export const emitEditorRemoveNode = async (
	client: LangflowerWsClient,
	nodeId: string,
): Promise<readonly WorkflowNodePersisted[]> => {
	const settled$ = firstValueFrom(client['editor.deleteNodes'].pipe(take(1)));
	client['editor.removeNode.requested'].next(nodeId);
	return settled$;
};

export const emitEditorRemoveEdge = async (
	client: LangflowerWsClient,
	edgeId: string,
): Promise<readonly RuntimeEdge[]> => {
	const settled$ = firstValueFrom(client['editor.deleteEdges'].pipe(take(1)));
	client['editor.removeEdge.requested'].next(edgeId);
	return settled$;
};
