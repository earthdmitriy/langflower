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
import { researchFanoutWorkflow } from '../helpers/scenarios/agents-pilots.js';
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

const SCENARIO_ID = 'research-fanout';

describe('execute research-fanout (WS bridge)', () => {
	it('defines Loop map-collect → synth → conflict HITL graph', () => {
		const scenario = researchFanoutWorkflow();
		const loop = scenario.graph.nodes.find((node) => node.id === 'loop');
		const explorer = scenario.graph.nodes.find(
			(node) => node.id === 'explorer',
		);
		const synth = scenario.graph.nodes.find((node) => node.id === 'synth');

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(loop?.type).toBe('common-loop');
		expect(explorer?.params.rolePreset).toBe('explorer');
		expect(synth?.type).toBe('common-fake-llm');
		expect(
			scenario.graph.nodes.some(
				(node) => node.type === 'common-hitl-review-gate',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some((edge) => edge.edgeId === 'e-loop-item'),
		).toBe(true);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-explorer-body',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some((edge) => edge.edgeId === 'e-loop-synth'),
		).toBe(true);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-synth-conflict',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-conflict-done',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.filter(
				(edge) =>
					edge.toNodeId === 'synth' && edge.toPort[0] === 'feedback',
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

		it('fans out N≥2 axes, merges results, synth reaches conflict; approve finishes', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				researchFanoutWorkflow(),
			);

			const packetsReady = waitForRunnerOutput(client, {
				nodeId: 'packets',
				portId: 'text',
				predicate: (value) => {
					try {
						const parsed: unknown = JSON.parse(String(value));
						return (
							Array.isArray(parsed) &&
							(parsed as unknown[]).length >= 2
						);
					} catch {
						return false;
					}
				},
			});
			const synthReady = waitForRunnerOutput(client, {
				nodeId: 'synth',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' &&
					value.includes('Reconciled brief'),
			});
			const finishPromise = waitForRunnerOutput(client, {
				nodeId: 'done',
				portId: 'value',
				predicate: (value) =>
					typeof value === 'string' &&
					value.includes('Reconciled brief'),
			});
			const donePromise = waitForRunnerDone(client);

			client['runner.start.requested'].next([]);
			const runId = await firstValueFrom(
				client['runner.started'].pipe(take(1)),
			);

			const packets = await packetsReady;
			const parsed: unknown = JSON.parse(String(packets[4]));
			expect(Array.isArray(parsed)).toBe(true);
			expect((parsed as string[]).length).toBeGreaterThanOrEqual(2);

			await synthReady;

			await sendHitlInput(
				client,
				{
					nodeId: 'conflict',
					portId: 'approve',
					payload: true,
				},
				runId,
			);

			const finish = await finishPromise;
			await donePromise;

			expect(String(finish[4])).toContain('Reconciled brief');
		}, 20_000);
	});
});
