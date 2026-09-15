import type { RunnerAskUserAskPayload } from '@langflower/shared/langflower.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { firstValueFrom, take } from 'rxjs';
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
import { fakeLlmAskUserWorkflow } from '../helpers/scenarios/fake-llm.js';
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

const SCENARIO_ID = 'fake-llm-ask-user';

describe('execute fake-llm ask_user (WS bridge)', () => {
	it('defines scripted ask_user graph', () => {
		const scenario = fakeLlmAskUserWorkflow();
		const llm = scenario.graph.nodes.find((node) => node.id === 'llm-1');

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(llm?.params.scriptedToolTurns).toBeDefined();
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
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
				// run may already be idle
			}
		});

		afterAll(async () => {
			client.close();
			await stopTestServer(urls);
			await removeTempProject(projectDir);
		});

		it('pauses on ask_user and continues with operator text', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				fakeLlmAskUserWorkflow(),
			);

			const askPromise = firstValueFrom(
				client['runner.askUser.ask'].pipe(take(1)),
			);
			const outputPromise = runFullGraphAndWaitForOutput(client, {
				nodeId: 'preview-1',
				portId: 'text',
				predicate: (value) =>
					typeof value === 'string' &&
					value.includes('The project is Langflower.'),
			});

			const ask: RunnerAskUserAskPayload = await askPromise;
			expect(ask.question).toBe('What is the project name?');
			expect(ask.nodeId).toBe('llm-1');

			client['runner.askUser.reply'].next({
				runId: ask.runId,
				askId: ask.askId,
				text: 'Langflower',
			});

			const { output } = await outputPromise;
			expect(String(output[3].value)).toContain(
				'The project is Langflower.',
			);
		}, 20_000);

		it('fail-closes ask_user when the run is interrupted', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				fakeLlmAskUserWorkflow(),
			);

			const askPromise = firstValueFrom(
				client['runner.askUser.ask'].pipe(take(1)),
			);
			client['runner.start.requested'].next([]);
			await askPromise;
			await interruptRunner(client);
		}, 20_000);
	});
});
