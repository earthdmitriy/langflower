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
import { delayPreviewWorkflow } from '../helpers/scenarios/smoke.js';

describe('execute delay-preview (WS bridge)', () => {
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

	it('runs string → delay(50ms) → preview', async () => {
		await seedWorkflowFromDisk(client, projectDir, delayPreviewWorkflow());

		const startedAt = Date.now();
		const { output } = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'preview-1',
			portId: 'text',
		});

		expect(output[4]).toBe('through-delay');
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(40);

		await interruptRunner(client);
	});
});
