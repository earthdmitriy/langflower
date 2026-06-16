import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstValueFrom, take } from 'rxjs';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import { stringPreviewWorkflow } from '../helpers/scenarios/smoke.js';
import {
	createLangflowerWsClient,
	emitEditorUpdateNode,
	emitEditorViewport,
	waitEditorViewportDelta,
	waitViewportSnapshot,
} from './langflower-ws-client.js';
import {
	requestWorkflowLoad,
	waitSessionReady,
	waitWorkflowCurrentSnapshot,
} from '@langflower/shared/langflower-ws-waits';
import {
	createTempProject,
	removeTempProject,
} from '../helpers/temp-project.js';
import {
	startTestServer,
	stopTestServer,
	type TestServerHandle,
} from '../helpers/test-server.js';

const SCENARIO_ID = 'smoke';

describe('WS session sync (WS bridge)', () => {
	it('defines shared workflow scenario for multi-tab sync', () => {
		expect(stringPreviewWorkflow().workflowId).toBe(SCENARIO_ID);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		let projectDir: string;
		let urls: TestServerHandle;

		beforeAll(async () => {
			projectDir = await createTempProject();
			urls = await startTestServer({ projectDir });
		});

		afterAll(async () => {
			await stopTestServer(urls);
			await removeTempProject(projectDir);
		});

		it('second client receives in-memory session.state.snapshot', async () => {
			const clientA = createLangflowerWsClient(urls.wsUrl);
			await waitSessionReady(clientA);
			await requestWorkflowLoad(clientA, { workflowId: 'example' });

			await emitEditorUpdateNode(clientA, {
				nodeId: 'string-1',
				position: { x: 77, y: 66 },
			});

			const clientB = createLangflowerWsClient(urls.wsUrl);
			const currentSnapshotPromise = waitWorkflowCurrentSnapshot(
				clientB,
				(s) => s.activeWorkflow !== null,
			);
			await waitSessionReady(clientB);
			const snapshot = await currentSnapshotPromise;
			const moved = snapshot.activeWorkflow?.graph.nodes.find(
				(node) => node.id === 'string-1',
			);

			expect(moved?.ui.position).toMatchObject({ x: 77, y: 66 });

			clientA.close();
			clientB.close();
		});

		it('reconnecting client receives in-memory graph without disk reload', async () => {
			const clientA = createLangflowerWsClient(urls.wsUrl);
			await waitSessionReady(clientA);
			await requestWorkflowLoad(clientA, { workflowId: 'example' });

			await emitEditorUpdateNode(clientA, {
				nodeId: 'string-1',
				position: { x: 55, y: 44 },
			});

			clientA.close();

			const clientB = createLangflowerWsClient(urls.wsUrl);
			const currentSnapshotPromise = waitWorkflowCurrentSnapshot(
				clientB,
				(s) => s.activeWorkflow !== null,
			);
			await waitSessionReady(clientB);
			const snapshot = await currentSnapshotPromise;
			const moved = snapshot.activeWorkflow?.graph.nodes.find(
				(node) => node.id === 'string-1',
			);

			expect(moved?.ui.position).toMatchObject({ x: 55, y: 44 });

			clientB.close();
		});

		it('broadcasts editor.viewport.delta and restores viewport on reconnect', async () => {
			const viewport = { x: 100, y: 50, scale: 1.25 };

			const clientA = createLangflowerWsClient(urls.wsUrl);
			await waitSessionReady(clientA);

			const clientB = createLangflowerWsClient(urls.wsUrl);
			const viewportBPromise = waitViewportSnapshot(clientB);
			await waitSessionReady(clientB);

			const deltaB$ = waitEditorViewportDelta(clientB);
			await emitEditorViewport(clientA, viewport);

			await expect(deltaB$).resolves.toEqual(viewport);

			clientA.close();

			const clientC = createLangflowerWsClient(urls.wsUrl);
			const viewportCPromise = waitViewportSnapshot(clientC);
			await waitSessionReady(clientC);
			const snapshot = await viewportCPromise;

			expect(snapshot.activeWorkflow?.graph.viewport).toEqual(viewport);

			clientB.close();
			clientC.close();
		});

		it.todo('saveCurrent broadcasts workflow.list.snapshot');
		it.todo('workflow.load binds graph — second tab sync via bridge facts');

		it('broadcasts runner.started and runner.interrupted to peer clients', async () => {
			const clientA = createLangflowerWsClient(urls.wsUrl);
			await waitSessionReady(clientA);
			await requestWorkflowLoad(clientA, { workflowId: 'example' });

			const clientB = createLangflowerWsClient(urls.wsUrl);
			await waitSessionReady(clientB);

			const startedA$ = firstValueFrom(
				clientA['runner.started'].pipe(take(1)),
			);
			const startedB$ = firstValueFrom(
				clientB['runner.started'].pipe(take(1)),
			);

			clientA['runner.start.requested'].next([]);

			const [runIdA, runIdB] = await Promise.all([startedA$, startedB$]);
			expect(runIdA).toBe(runIdB);

			const interruptedA$ = firstValueFrom(
				clientA['runner.interrupted'].pipe(take(1)),
			);
			const interruptedB$ = firstValueFrom(
				clientB['runner.interrupted'].pipe(take(1)),
			);

			clientA['runner.interrupt.requested'].next('cancel');

			const [reasonA, reasonB] = await Promise.all([
				interruptedA$,
				interruptedB$,
			]);
			expect(reasonA).toBe('cancel');
			expect(reasonB).toBe('cancel');

			clientA.close();
			clientB.close();
		});
	});
});
