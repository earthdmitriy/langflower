import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
	createLangflowerWsClient,
	expectWorkflowLoadKeepsActiveId,
	runFromNodeAndWaitForOutput,
	runFullGraphAndWaitForOutput,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	interruptRunner,
	requestWorkflowLoad,
	type LangflowerWsClient,
	waitForRunnerDone,
	waitSessionReady,
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
import {
	stringFinishWorkflow,
	stringPreviewOpenRunWorkflow,
	stringPreviewWorkflow,
} from '../helpers/scenarios/smoke.js';

describe('execute workflow runtime (WS bridge)', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		projectDir = await createTempProject();
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
	});

	afterEach(async () => {
		try {
			await interruptRunner(client);
		} catch {
			// runner already idle
		}
	});

	afterAll(async () => {
		client.close();
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('runs a saved linear graph to runner.done', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			stringFinishWorkflow('done-value'),
		);

		const donePromise = waitForRunnerDone(client);
		const { runId, output } = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'finish-1',
			portId: 'value',
			predicate: (value) => value === 'done-value',
		});

		expect(output[3].value).toBe('done-value');
		await donePromise;
		expect(runId).toBeTruthy();
	});

	it('runs string → preview and emits preview output', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			stringPreviewWorkflow('full-run'),
		);

		const { output } = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'preview-1',
			portId: 'text',
			predicate: (value) => value === 'full-run',
		});

		expect(output[3].value).toBe('full-run');
	});

	it('runs from a selected node cluster via runner.startNode', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			stringPreviewWorkflow('from-node'),
		);

		const { output } = await runFromNodeAndWaitForOutput(
			client,
			'string-1',
			{
				nodeId: 'preview-1',
				portId: 'text',
			},
		);

		expect(output[3].value).toBe('from-node');
	});

	it('interrupts an active run without finish node', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			stringPreviewOpenRunWorkflow(),
		);

		await runFullGraphAndWaitForOutput(client, {
			nodeId: 'preview-1',
			portId: 'text',
		});

		await interruptRunner(client);
	});

	it('keeps active workflow when loading while runner is active', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			stringPreviewOpenRunWorkflow(),
		);

		const outputPromise = runFullGraphAndWaitForOutput(client, {
			nodeId: 'preview-1',
			portId: 'text',
		});

		const snapshot = await expectWorkflowLoadKeepsActiveId(
			client,
			{ workflowId: 'example' },
			'open-run',
		);

		expect(snapshot.currentStatus.status).toBe('pristine');
		await outputPromise;
	});
});
