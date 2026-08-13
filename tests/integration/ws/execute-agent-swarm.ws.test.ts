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
import { agentSwarmWorkflow } from '../helpers/scenarios/agents-pilots.js';
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

const SCENARIO_ID = 'agent-swarm';

describe('execute agent-swarm (WS bridge)', () => {
	it('defines registration/spawn/result edges for ADR-021 L0', () => {
		const scenario = agentSwarmWorkflow();
		const explorer = scenario.graph.nodes.find(
			(node) => node.id === 'explorer',
		);
		const main = scenario.graph.nodes.find((node) => node.id === 'main');

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(explorer?.type).toBe('common-sub-agent');
		expect(main?.type).toBe('common-fake-llm');
		expect(
			scenario.graph.edges.some((edge) => edge.edgeId === 'e-reg'),
		).toBe(true);
		expect(
			scenario.graph.edges.some((edge) => edge.edgeId === 'e-spawn'),
		).toBe(true);
		expect(
			scenario.graph.edges.some((edge) => edge.edgeId === 'e-result'),
		).toBe(true);
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

		it('spawns Sub-Agent, runs in-node chat, resumes main with tool result', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				agentSwarmWorkflow(),
			);

			const { output } = await runFullGraphAndWaitForOutput(client, {
				nodeId: 'out',
				portId: 'text',
			});

			expect(String(output[4])).toContain('Swarm done');
		});
	});
});
