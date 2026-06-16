import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createLangflowerWsClient,
	runFullGraphAndWaitForOutput,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	interruptRunner,
	type LangflowerWsClient,
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
import { hardHarnessAssertIfWorkflow } from '../helpers/scenarios/smoke.js';

describe('execute hard-harness Assert+IF (WS bridge)', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		projectDir = await createTempProject();
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
	});

	afterAll(async () => {
		client.close();
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('Assert pass → IF true → preview', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			hardHarnessAssertIfWorkflow(),
		);

		const { output } = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'preview-1',
			portId: 'text',
		});

		expect(output.value).toBe('plan-ok');

		await interruptRunner(client);
	});
});
