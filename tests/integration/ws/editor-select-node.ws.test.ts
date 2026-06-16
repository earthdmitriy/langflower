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
import { stringNodeAddPayload } from '../helpers/workflow-scenario-builders.js';
import {
	createLangflowerWsClient,
	emitEditorAddNode,
	emitEditorRemoveNode,
	emitEditorSelectNode,
	waitEditorNodeSelected,
} from './langflower-ws-client.js';
import {
	requestWorkflowLoad,
	waitSessionReady,
	waitSessionSnapshot,
	type LangflowerWsClient,
} from '@langflower/shared/langflower-ws-waits';

describe('editor node selection (WS bridge)', () => {
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

	it('selecting a node broadcasts editor.nodeSelected with node + palette definition to all tabs', async () => {
		const clientB = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(clientB);

		const selectedB$ = waitEditorNodeSelected(clientB);

		const selectedA = await emitEditorSelectNode(client, {
			nodeId: 'string-1',
		});

		expect(selectedA.node?.id).toBe('string-1');
		expect(selectedA.node?.type).toBe('common-string');
		expect(selectedA.node?.definition.type).toBe('common-string');

		await expect(selectedB$).resolves.toEqual(selectedA);

		clientB.close();
	});

	it('clears selection and broadcasts node: null when nodeId is null', async () => {
		await emitEditorSelectNode(client, { nodeId: 'string-1' });

		const cleared = await emitEditorSelectNode(client, { nodeId: null });

		expect(cleared.node).toBeNull();
	});

	it('a newly connected tab receives the current selection in session.state.snapshot', async () => {
		await emitEditorSelectNode(client, { nodeId: 'preview-1' });

		const clientB = createLangflowerWsClient(urls.wsUrl);
		const snapshot = await waitSessionSnapshot(clientB);

		expect(snapshot.selectedNode?.id).toBe('preview-1');

		clientB.close();
	});

	it('ignores selecting a nodeId that is not on the active graph (no broadcast)', async () => {
		await emitEditorSelectNode(client, { nodeId: 'string-1' });

		const next$ = waitEditorNodeSelected(client);
		client['editor.selectNode.requested'].next({
			nodeId: 'does-not-exist',
		});

		// Follow with a real selection to resolve `next$` deterministically —
		// if the invalid request had broadcast, this would observe two events
		// (the invalid one first) instead of only the valid one.
		const selected = await emitEditorSelectNode(client, {
			nodeId: 'preview-1',
		});

		await expect(next$).resolves.toEqual(selected);
	});

	it('clears selection and broadcasts node: null when the selected node is removed', async () => {
		const [added] = await emitEditorAddNode(
			client,
			stringNodeAddPayload('select-then-remove', { x: 0, y: 500 }),
		);

		await emitEditorSelectNode(client, { nodeId: added!.id });

		const cleared$ = waitEditorNodeSelected(client);
		await emitEditorRemoveNode(client, added!.id);

		await expect(cleared$).resolves.toEqual({ node: null });
	});
});
