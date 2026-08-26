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
import { chatInputMultiTurnWorkflow } from '../helpers/scenarios/agents-pilots.js';
import {
	createLangflowerWsClient,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	interruptRunner,
	sendHitlInput,
	waitForRunnerOutput,
	type LangflowerWsClient,
	waitSessionReady,
} from '@langflower/shared/langflower-ws-waits';

const SCENARIO_ID = 'chat-input-multi-turn';

describe('execute Chat Input (WS bridge)', () => {
	it('defines chat-input multi-turn scenario graph', () => {
		const scenario = chatInputMultiTurnWorkflow();
		const chat = scenario.graph.nodes.find((node) => node.id === 'chat');

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(chat?.type).toBe('common-chat-input');
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-ask-feedback',
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

		it('cold-starts from composer and continues via Review Gate feedback', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				chatInputMultiTurnWorkflow(),
			);

			const firstPreview = waitForRunnerOutput(client, {
				nodeId: 'preview',
				portId: 'text',
				predicate: (value) =>
					typeof value === 'string' && value.includes('hello agent'),
			});

			const started$ = firstValueFrom(
				client['runner.started'].pipe(take(1)),
			);

			await sendHitlInput(client, {
				nodeId: 'chat',
				portId: 'message',
				payload: 'hello agent',
			});

			const runId = await started$;
			expect(typeof runId).toBe('string');

			const turn1 = await firstPreview;
			expect(String(turn1[3].value)).toContain('hello agent');

			const secondPreview = waitForRunnerOutput(client, {
				nodeId: 'preview',
				portId: 'text',
				predicate: (value) =>
					typeof value === 'string' &&
					value.includes('please revise') &&
					value.includes('feedback'),
			});

			await sendHitlInput(
				client,
				{
					nodeId: 'ask',
					portId: 'requestChanges',
					payload: 'please revise',
				},
				runId,
			);

			const turn2 = await secondPreview;
			expect(String(turn2[3].value).toLowerCase()).toContain('feedback');
			expect(String(turn2[3].value)).toContain('please revise');
		});

		it('plain Run does not start a chat-entry-only graph', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				chatInputMultiTurnWorkflow(),
			);

			const started: string[] = [];
			const sub = client['runner.started'].subscribe((id) => {
				started.push(id);
			});

			client['runner.start.requested'].next([]);
			await new Promise((resolve) => setTimeout(resolve, 200));

			sub.unsubscribe();
			expect(started).toEqual([]);
		});

		it('restarts from the same Chat Input message after interrupt', async () => {
			const workflow = chatInputMultiTurnWorkflow();
			const seeded = {
				...workflow,
				graph: {
					...workflow.graph,
					nodes: workflow.graph.nodes.map((node) =>
						node.id === 'chat'
							? { ...node, inputs: { message: 'hello agent' } }
							: node,
					),
				},
			};
			await seedWorkflowFromDisk(client, projectDir, seeded);

			const firstPreview = waitForRunnerOutput(client, {
				nodeId: 'preview',
				portId: 'text',
				predicate: (value) =>
					typeof value === 'string' && value.includes('hello agent'),
			});

			await sendHitlInput(client, {
				nodeId: 'chat',
				portId: 'message',
				payload: 'hello agent',
			});
			await firstPreview;

			await interruptRunner(client);

			const secondPreview = waitForRunnerOutput(client, {
				nodeId: 'preview',
				portId: 'text',
				predicate: (value) =>
					typeof value === 'string' && value.includes('hello agent'),
			});

			await sendHitlInput(client, {
				nodeId: 'chat',
				portId: 'message',
				payload: 'hello agent',
			});
			const turn2 = await secondPreview;
			expect(String(turn2[3].value)).toContain('hello agent');
		});
	});
});
