import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createLangflowerWsClient,
	runFullGraphAndWaitForOutput,
} from './langflower-ws-client.js';
import {
	interruptRunner,
	requestWorkflowLoad,
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

describe('execute smoke (WS bridge)', () => {
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

	it('loads bootstrap example, runs, and emits preview output', async () => {
		await requestWorkflowLoad(client, { workflowId: 'example' });

		const { output } = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'preview-1',
			portId: 'text',
		});

		expect(output[3].value).toBe('Hello Langflower');

		await interruptRunner(client);
	});
});
