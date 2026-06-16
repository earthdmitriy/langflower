import type { RunnerPermissionAskPayload } from '@langflower/shared/langflower.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
import { fakeLlmMaxIterationsContinueWorkflow } from '../helpers/scenarios/fake-llm.js';
import {
	autoAllowPermissions,
	createLangflowerWsClient,
	runFullGraphAndWaitForOutput,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	interruptRunner,
	type LangflowerWsClient,
	waitSessionReady,
} from '@langflower/shared/langflower-ws-waits';

const SCENARIO_ID = 'fake-llm-max-iterations-continue';

describe('execute fake-llm maxIterations continue (WS bridge)', () => {
	it('defines scripted write + continue graph', () => {
		const scenario = fakeLlmMaxIterationsContinueWorkflow();
		const llm = scenario.graph.nodes.find((node) => node.id === 'llm-1');

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(llm?.params.maxIterations).toBe(1);
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

		it('asks agent.maxIterations and continues after Allow', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				fakeLlmMaxIterationsContinueWorkflow(),
			);

			const asks: RunnerPermissionAskPayload[] = [];
			const askSub = client['runner.permission.ask'].subscribe((ask) => {
				asks.push(ask);
			});
			const allowSub = autoAllowPermissions(client);

			const { output } = await runFullGraphAndWaitForOutput(client, {
				nodeId: 'preview-1',
				portId: 'text',
				predicate: (value) =>
					typeof value === 'string' &&
					value.includes('continued after allow'),
			});

			askSub.unsubscribe();
			allowSub.unsubscribe();

			expect(String(output.value)).toContain('continued after allow');
			expect(
				asks.some((ask) => ask.toolId === 'agent.maxIterations'),
			).toBe(true);
		}, 20_000);
	});
});
