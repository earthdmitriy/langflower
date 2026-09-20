import type { RunnerPermissionAskPayload } from '@langflower/shared/types/langflower-config.js';
import {
	interruptRunner,
	type LangflowerWsClient,
	waitSessionReady,
} from '@langflower/shared/langflower-ws-waits';
import fs from 'node:fs/promises';
import path from 'node:path';
import { firstValueFrom, take } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeLlmPermissionAskTimeoutWorkflow } from '../helpers/scenarios/fake-llm.js';
import {
	createTempProject,
	removeTempProject,
} from '../helpers/temp-project.js';
import {
	startTestServer,
	stopTestServer,
	type TestServerHandle,
} from '../helpers/test-server.js';
import { scenarioReadyById } from '../helpers/workflow-scenario-registry.js';
import {
	createLangflowerWsClient,
	runFullGraphAndWaitForOutput,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';

const SCENARIO_ID = 'fake-llm-permission-ask-timeout';

const delay = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

describe('execute fake-llm permission.ask vs toolTimeoutMs (WS bridge)', () => {
	it('defines scripted read+ask graph', () => {
		const scenario = fakeLlmPermissionAskTimeoutWorkflow();
		const llm = scenario.graph.nodes.find((node) => node.id === 'llm-1');

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(llm?.params.toolTimeoutMs).toBe(50);
		expect(
			(llm?.params.toolPermissions as Record<string, string> | undefined)
				?.read,
		).toBe('ask');
	});

	describe('runtime', () => {
		scenarioReadyById(SCENARIO_ID);
		let projectDir: string;
		let urls: TestServerHandle;
		let client: LangflowerWsClient;

		beforeAll(async () => {
			projectDir = await createTempProject();
			await fs.writeFile(
				path.join(projectDir, 'notes.md'),
				'hello from notes\n',
				'utf8',
			);
			urls = await startTestServer({ projectDir });
			client = createLangflowerWsClient(urls.wsUrl);
			await waitSessionReady(client);
		});

		afterEach(async () => {
			try {
				await interruptRunner(client);
			} catch {
				// run may already be idle
			}
		});

		afterAll(async () => {
			client.close();
			await stopTestServer(urls);
			await removeTempProject(projectDir);
		});

		it('keeps permission.ask pending past toolTimeoutMs then continues on Allow', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				fakeLlmPermissionAskTimeoutWorkflow(),
			);

			const askPromise = firstValueFrom(
				client['runner.permission.ask'].pipe(take(1)),
			);
			const outputPromise = runFullGraphAndWaitForOutput(client, {
				nodeId: 'preview-1',
				portId: 'text',
				predicate: (value) =>
					typeof value === 'string' &&
					value.includes('read after allow'),
			});

			const ask: RunnerPermissionAskPayload = await askPromise;
			expect(ask.toolId).toBe('read');

			await delay(150);

			const acceptedPromise = firstValueFrom(
				client['runner.permission.accepted'].pipe(take(1)),
			);
			client['runner.permission.reply'].next({
				runId: ask.runId,
				askId: ask.askId,
				decision: 'allow',
			});
			const accepted = await acceptedPromise;
			expect(accepted.askId).toBe(ask.askId);
			expect(accepted.decision).toBe('allow');

			await outputPromise;
		}, 20_000);
	});
});
