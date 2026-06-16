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
import { adversarialRedTeamWorkflow } from '../helpers/scenarios/fake-llm.js';
import {
	createLangflowerWsClient,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	interruptRunner,
	sendHitlInput,
	waitForRunnerDone,
	waitForRunnerOutput,
	type LangflowerWsClient,
	waitSessionReady,
} from '@langflower/shared/langflower-ws-waits';

const SCENARIO_ID = 'adversarial-red-team';

describe('execute adversarial-red-team pilot (WS bridge)', () => {
	it('defines proposer → attacker feedback → HITL accept graph', () => {
		const scenario = adversarialRedTeamWorkflow();
		const proposer = scenario.graph.nodes.find(
			(node) => node.id === 'proposer',
		);

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(proposer?.params.maxFeedbackTurns).toBe(1);
		expect(
			scenario.graph.nodes.some(
				(node) => node.type === 'common-fake-llm',
			),
		).toBe(true);
		expect(
			scenario.graph.nodes.some(
				(node) => node.type === 'common-hitl-review-gate',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-attacker-proposer-feedback',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-accept-done',
			),
		).toBe(true);
		// Single wire into proposer.feedback (not multi) — no HITL reject edge.
		expect(
			scenario.graph.edges.filter(
				(edge) =>
					edge.toNodeId === 'proposer' &&
					edge.toPort[0] === 'feedback',
			),
		).toHaveLength(1);
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

		it('attacker critique reaches HITL; approve finishes the run', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				adversarialRedTeamWorkflow(),
			);

			const attackReady = waitForRunnerOutput(client, {
				nodeId: 'attacker',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' && value.includes('Final:'),
			});
			const finishPromise = waitForRunnerOutput(client, {
				nodeId: 'done',
				portId: 'value',
				predicate: (value) =>
					typeof value === 'string' && value.includes('Final:'),
			});
			const donePromise = waitForRunnerDone(client);

			client['runner.start.requested'].next([]);
			const runId = await firstValueFrom(
				client['runner.started'].pipe(take(1)),
			);

			const attack = await attackReady;
			expect(String(attack.value)).toContain('Final:');

			await sendHitlInput(
				client,
				{
					nodeId: 'accept',
					portId: 'approve',
					payload: true,
				},
				runId,
			);

			const finish = await finishPromise;
			await donePromise;

			expect(String(finish.value)).toContain('Final:');
		}, 15_000);
	});
});
