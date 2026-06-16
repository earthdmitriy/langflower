import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { filter, firstValueFrom, take } from 'rxjs';
import type { RuntimeRunnerEvent } from '@langflower/runtime';
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
import { evalRegressionGateWorkflow } from '../helpers/scenarios/eval.js';

type OutputErrorEvent = Extract<
	RuntimeRunnerEvent,
	{ kind: 'output-emitted'; state: 'error' }
>;

const waitForAssertError = (
	client: LangflowerWsClient,
): Promise<OutputErrorEvent> =>
	firstValueFrom(
		client['runner.output-emitted'].pipe(
			filter(
				(event): event is OutputErrorEvent =>
					event.kind === 'output-emitted' &&
					event.state === 'error' &&
					event.nodeId === 'gate' &&
					event.portId === 'value',
			),
			take(1),
		),
	);

describe('execute eval-regression-gate (WS bridge)', () => {
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

	it('Compare+Assert passes when suiteScore >= threshold', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			evalRegressionGateWorkflow(1, 1),
		);

		const { output } = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'done',
			portId: 'value',
			predicate: (value) =>
				typeof value === 'string' && value.includes('suiteScore=1'),
		});

		expect(String(output.value)).toContain('threshold=1');
	});

	it('Assert fails the workflow when suiteScore < threshold', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			evalRegressionGateWorkflow(0.5, 1),
		);

		const errorPromise = waitForAssertError(client);
		client['runner.start.requested'].next([]);
		await firstValueFrom(client['runner.started'].pipe(take(1)));

		const errorEvent = await errorPromise;
		// Error instances are not preserved over the WS bridge — assert the
		// fail-closed signal (output-emitted state=error on the Assert gate).
		expect(errorEvent.state).toBe('error');
		expect(errorEvent.nodeId).toBe('gate');
	});
});
