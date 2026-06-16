import { filter, firstValueFrom, take } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createTempProject,
	removeTempProject,
} from '../helpers/temp-project.js';
import {
	startTestServer,
	stopTestServer,
	type TestServerHandle,
} from '../helpers/test-server.js';
import {
	previewNodeAddPayload,
	stringNodeAddPayload,
} from '../helpers/workflow-scenario-builders.js';
import { stringPreviewOpenRunWorkflow } from '../helpers/scenarios/smoke.js';
import {
	createLangflowerWsClient,
	emitEditorAddEdge,
	emitEditorAddNode,
	emitEditorPaste,
	emitEditorRemoveEdge,
	emitEditorRemoveNode,
	emitEditorUpdateNode,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	requestWorkflowLoad,
	startRunner,
	waitSessionReady,
	waitSessionSnapshot,
	type LangflowerWsClient,
} from '@langflower/shared/langflower-ws-waits';

describe('editor bus (WS bridge)', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		projectDir = await createTempProject();
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
		await requestWorkflowLoad(client, { workflowId: 'example' });
	});

	afterAll(async () => {
		client.close();
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('adds node via editor.addNode.requested → delta', async () => {
		const status$ = firstValueFrom(
			client['workflow.currentStatus.snapshot'].pipe(
				filter((payload) => payload.status === 'dirty'),
				take(1),
			),
		);

		const delta = await emitEditorAddNode(
			client,
			stringNodeAddPayload('from-editor-bus', { x: 400, y: 120 }),
		);

		expect(delta).toHaveLength(1);
		expect(delta[0]?.type).toBe('common-string');
		expect(delta[0]?.inputs).toEqual({ value: 'from-editor-bus' });
		expect(delta[0]?.ui.position).toEqual({ x: 400, y: 120 });
		await expect(status$).resolves.toEqual({ status: 'dirty' });
	});

	it('adds edge via editor.addEdge.requested → delta', async () => {
		const [src] = await emitEditorAddNode(
			client,
			stringNodeAddPayload('wire-me', { x: 0, y: 0 }),
		);
		const [sink] = await emitEditorAddNode(
			client,
			previewNodeAddPayload({ x: 240, y: 0 }),
		);

		const delta = await emitEditorAddEdge(client, {
			fromNodeId: src!.id,
			fromPort: ['value', 0],
			toNodeId: sink!.id,
			toPort: ['text', 0],
		});

		expect(delta).toHaveLength(1);
		expect(delta[0]?.fromNodeId).toBe(src!.id);
		expect(delta[0]?.toNodeId).toBe(sink!.id);
	});

	it('replaces edge on occupied target port via remove then add deltas', async () => {
		const [srcA] = await emitEditorAddNode(
			client,
			stringNodeAddPayload('replace-src-a', { x: 0, y: 300 }),
		);
		const [srcB] = await emitEditorAddNode(
			client,
			stringNodeAddPayload('replace-src-b', { x: 0, y: 400 }),
		);
		const [preview] = await emitEditorAddNode(
			client,
			previewNodeAddPayload({ x: 240, y: 350 }),
		);
		const [downstreamSink] = await emitEditorAddNode(client, {
			type: 'common-delay',
			position: { x: 480, y: 350 },
			inputs: { delay: 0 },
			label: 'replace-downstream',
		});

		const [firstEdge] = await emitEditorAddEdge(client, {
			fromNodeId: srcA!.id,
			fromPort: ['value', 0],
			toNodeId: preview!.id,
			toPort: ['text', 0],
		});
		await emitEditorAddEdge(client, {
			fromNodeId: preview!.id,
			fromPort: ['text', 0],
			toNodeId: downstreamSink!.id,
			toPort: ['value', 0],
		});

		const removeDelta$ = firstValueFrom(
			client['editor.deleteEdges'].pipe(
				filter((edges) => edges.length > 0),
				take(1),
			),
		);
		const addDelta$ = firstValueFrom(
			client['editor.addEdges'].pipe(
				filter((edges) => edges.length > 0),
				take(1),
			),
		);

		client['editor.addEdge.requested'].next({
			fromNodeId: srcB!.id,
			fromPort: ['value', 0],
			toNodeId: preview!.id,
			toPort: ['text', 0],
		});

		const [removed, added] = await Promise.all([removeDelta$, addDelta$]);

		expect(removed).toEqual([firstEdge]);
		expect(added).toHaveLength(1);
		expect(added[0]?.fromNodeId).toBe(srcB!.id);
		expect(added[0]?.toNodeId).toBe(preview!.id);
	});

	it('updates node via editor.updateNode.requested → delta', async () => {
		const [added] = await emitEditorAddNode(
			client,
			stringNodeAddPayload('move-me', { x: 0, y: 0 }),
		);

		const delta = await emitEditorUpdateNode(client, {
			nodeId: added!.id,
			position: { x: 120, y: 48 },
			ui: { width: 200, height: 96 },
		});

		expect(delta).toHaveLength(1);
		expect(delta[0]?.ui.position).toEqual({
			x: 120,
			y: 48,
			width: 200,
			height: 96,
		});
	});

	it('applies panel params via editor.updateNode.requested → delta', async () => {
		const [added] = await emitEditorAddNode(client, {
			type: 'common-fake-llm',
			position: { x: 16, y: 400 },
			params: {
				rolePreset: 'custom',
				maxIterations: 8,
				maxFeedbackTurns: 0,
			},
			label: 'Params LLM',
		});

		const delta = await emitEditorUpdateNode(client, {
			nodeId: added!.id,
			params: {
				rolePreset: 'custom',
				maxIterations: 7,
				maxFeedbackTurns: 3,
			},
		});

		expect(delta).toHaveLength(1);
		expect(delta[0]?.params.maxIterations).toBe(7);
		expect(delta[0]?.params.maxFeedbackTurns).toBe(3);
	});

	it('pastes nodes and edges via editor.paste.requested', async () => {
		const { nodes, edges } = await emitEditorPaste(client, {
			nodes: [
				{
					clientId: 'paste-src',
					type: 'common-string',
					position: { x: 16, y: 16, width: 180, height: 72 },
					inputs: { value: 'from-paste' },
					label: 'Pasted',
				},
				{
					clientId: 'paste-sink',
					type: 'common-preview',
					position: { x: 260, y: 16 },
				},
			],
			edges: [
				{
					fromClientId: 'paste-src',
					fromPort: ['value', 0],
					toClientId: 'paste-sink',
					toPort: ['text', 0],
				},
			],
		});

		expect(nodes).toHaveLength(2);
		expect(edges).toHaveLength(1);
		expect(nodes[0]?.ui.label).toBe('Pasted');
		expect(nodes[0]?.ui.position.width).toBe(180);
		expect(edges[0]?.fromNodeId).toBe(nodes[0]?.id);
		expect(edges[0]?.toNodeId).toBe(nodes[1]?.id);
	});

	it('returns removed node on editor.removeNode.delta', async () => {
		const [node] = await emitEditorAddNode(
			client,
			stringNodeAddPayload('temp', { x: 80, y: 80 }),
		);

		const delta = await emitEditorRemoveNode(client, node!.id);

		expect(delta).toEqual([node]);
	});

	it('returns removed edge on editor.removeEdge.delta', async () => {
		const [src] = await emitEditorAddNode(
			client,
			stringNodeAddPayload('x', { x: 0, y: 200 }),
		);
		const [sink] = await emitEditorAddNode(
			client,
			previewNodeAddPayload({ x: 240, y: 200 }),
		);
		const [addedEdge] = await emitEditorAddEdge(client, {
			fromNodeId: src!.id,
			fromPort: ['value', 0],
			toNodeId: sink!.id,
			toPort: ['text', 0],
		});

		const delta = await emitEditorRemoveEdge(client, addedEdge!.edgeId);

		expect(delta).toEqual([addedEdge]);
	});

	it('broadcasts editor.updateNode.delta to all tabs without workflow snapshot', async () => {
		const clientB = createLangflowerWsClient(urls.wsUrl);
		await waitSessionSnapshot(clientB);

		let snapshotDuringMove = false;
		const snapshotSub = clientB['workflow.current.snapshot'].subscribe(
			() => {
				snapshotDuringMove = true;
			},
		);

		const targetNodeId = 'string-1';

		const deltaA$ = firstValueFrom(
			client['editor.updateNodes'].pipe(
				filter((nodes) =>
					nodes.some((node) => node.id === targetNodeId),
				),
				take(1),
			),
		);
		const deltaB$ = firstValueFrom(
			clientB['editor.updateNodes'].pipe(
				filter((nodes) =>
					nodes.some((node) => node.id === targetNodeId),
				),
				take(1),
			),
		);

		client['editor.updateNode.requested'].next({
			nodeId: targetNodeId,
			position: { x: 99, y: 88 },
		});

		const [deltaA, deltaB] = await Promise.all([deltaA$, deltaB$]);

		expect(deltaA).toEqual(deltaB);
		expect(deltaA[0]?.ui.position).toMatchObject({ x: 99, y: 88 });
		expect(snapshotDuringMove).toBe(false);

		snapshotSub.unsubscribe();
		clientB.close();
	}, 15_000);

	it('does not mark dirty when viewport echo matches current', async () => {
		const loaded = await requestWorkflowLoad(client, {
			workflowId: 'example',
		});
		const viewport = loaded.graph.viewport;

		const dirtyRace = Promise.race([
			firstValueFrom(
				client['workflow.currentStatus.snapshot'].pipe(
					filter((payload) => payload.status === 'dirty'),
					take(1),
				),
			).then(() => 'dirty' as const),
			new Promise<'ok'>((resolve) => {
				setTimeout(() => resolve('ok'), 400);
			}),
		]);

		client['editor.viewport.requested'].next(viewport);

		await expect(dirtyRace).resolves.toBe('ok');
	});

	it('while graph is locked: topology rejected, params-only applied', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			stringPreviewOpenRunWorkflow(),
		);
		await startRunner(client);

		const addDelta$ = new Promise<readonly unknown[]>((resolve) => {
			const sub = client['editor.addNodes'].subscribe((payload) => {
				sub.unsubscribe();
				resolve(payload);
			});
			client['editor.addNode.requested'].next(
				stringNodeAddPayload('nope', { x: 0, y: 0 }),
			);
		});

		await expect(addDelta$).resolves.toEqual([]);

		const paramsDelta$ = new Promise<
			readonly {
				readonly id: string;
				readonly params: Readonly<Record<string, unknown>>;
			}[]
		>((resolve) => {
			const sub = client['editor.updateNodes'].subscribe((payload) => {
				sub.unsubscribe();
				resolve(payload);
			});
			client['editor.updateNode.requested'].next({
				nodeId: 'string-1',
				params: {
					maxIterations: 7,
					maxFeedbackTurns: 3,
				},
			});
		});

		const paramsDelta = await paramsDelta$;
		expect(paramsDelta).toHaveLength(1);
		expect(paramsDelta[0]?.id).toBe('string-1');
		expect(paramsDelta[0]?.params.maxIterations).toBe(7);
		expect(paramsDelta[0]?.params.maxFeedbackTurns).toBe(3);
	});
});
