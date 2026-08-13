import fs from 'node:fs/promises';
import path from 'node:path';
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
import { promptRefiningWorkflow } from '../helpers/scenarios/agents-pilots.js';
import {
	autoAllowPermissions,
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

const SCENARIO_ID = 'prompt-refining';

describe('execute prompt-refining pilot (WS bridge)', () => {
	it('defines prompt-refining scenario graph', () => {
		const scenario = promptRefiningWorkflow();

		expect(scenario.workflowId).toBe(SCENARIO_ID);
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
				(edge) => edge.edgeId === 'e-qa-feedback',
			),
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

		it('writes prompt file, HITL approve reaches finish', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				promptRefiningWorkflow(),
			);

			const allowSub = autoAllowPermissions(client);
			const draftReady = waitForRunnerOutput(client, {
				nodeId: 'draft',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' &&
					value.includes('prompts/scene-01.md'),
			});
			const finishPromise = waitForRunnerOutput(client, {
				nodeId: 'done',
				portId: 'value',
				predicate: (value) =>
					typeof value === 'string' &&
					value.includes('prompts/scene-01.md'),
			});
			const donePromise = waitForRunnerDone(client);

			client['runner.start.requested'].next([]);
			const runId = await firstValueFrom(
				client['runner.started'].pipe(take(1)),
			);

			await draftReady;
			await sendHitlInput(
				client,
				{
					nodeId: 'qa',
					portId: 'approve',
					payload: true,
				},
				runId,
			);

			const finish = await finishPromise;
			await donePromise;
			allowSub.unsubscribe();

			expect(String(finish[4])).toContain('prompts/scene-01.md');

			const artifact = await fs.readFile(
				path.join(projectDir, 'prompts', 'scene-01.md'),
				'utf8',
			);
			expect(artifact).toContain('misty harbor');
			expect(artifact).toContain('--ar 16:9');
		});
	});
});
