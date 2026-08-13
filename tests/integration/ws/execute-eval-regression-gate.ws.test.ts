import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { filter, firstValueFrom, take } from 'rxjs';
import type { PortTelemetry } from '@langflower/runtime';
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

type OutputErrorEvent = PortTelemetry & {
	readonly 0: 'out';
	readonly 3: 'error';
};

const waitForAssertError = (
	client: LangflowerWsClient,
): Promise<OutputErrorEvent> =>
	firstValueFrom(
		client['runner.port'].pipe(
			filter(
				(event): event is OutputErrorEvent =>
					event[0] === 'out' &&
					event[3] === 'error' &&
					event[1] === 'gate' &&
					event[2] === 'value',
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

		expect(String(output[4])).toContain('threshold=1');
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
		expect(errorEvent[3]).toBe('error');
		expect(errorEvent[1]).toBe('gate');
	});
});
