import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TerminalExecutionProgressStatus } from '@langflower/shared/langflower.js';
import { stringFinishWorkflow } from '../helpers/scenarios/smoke.js';
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
	createLangflowerWsClient,
	runFullGraphAndWaitForOutput,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	waitExecutionFeedSnapshot,
	waitForRunnerDone,
	waitSessionReady,
} from '@langflower/shared/langflower-ws-waits';

describe('detachable long run (settle + reconnect)', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let settledStatuses: TerminalExecutionProgressStatus[];

	beforeAll(async () => {
		projectDir = await createTempProject();
		settledStatuses = [];
		urls = await startTestServer({
			projectDir,
			onRunSettled: (status) => {
				settledStatuses.push(status);
			},
		});
	});

	afterAll(async () => {
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('fires onRunSettled with completed and restores settled feed on reconnect', async () => {
		const clientA = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(clientA);
		await seedWorkflowFromDisk(
			clientA,
			projectDir,
			stringFinishWorkflow('settle-ok'),
		);

		settledStatuses.length = 0;
		const donePromise = waitForRunnerDone(clientA);
		const { runId } = await runFullGraphAndWaitForOutput(clientA, {
			nodeId: 'finish-1',
			portId: 'value',
			predicate: (value) => value === 'settle-ok',
		});
		await donePromise;

		expect(settledStatuses).toEqual(['completed']);

		clientA.close();

		const clientB = createLangflowerWsClient(urls.wsUrl);
		const feedPromise = waitExecutionFeedSnapshot(
			clientB,
			(snap) =>
				snap !== null &&
				snap.runId === runId &&
				snap.status === 'completed' &&
				snap.events.length > 0,
		);
		await waitSessionReady(clientB);
		const feed = await feedPromise;

		expect(feed).toMatchObject({
			runId,
			status: 'completed',
		});
		expect(feed?.events.some((event) => event.kind === 'done')).toBe(true);

		clientB.close();
	});
});
