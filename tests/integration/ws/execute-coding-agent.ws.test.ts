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
import { codingAgentWorkflow } from '../helpers/scenarios/agents-pilots.js';
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

const SCENARIO_ID = 'coding-agent';
const DEMO_WORKFLOW = path.resolve(
	import.meta.dirname,
	'../../../demo-project/.langflower/workflows/coding-agent.json',
);
const GREET_SOURCE = [
	'export const greet = (): string => {',
	"\treturn 'Hello, world!';",
	'};',
	'',
].join('\n');

describe('execute coding-agent full pipeline (WS bridge)', () => {
	it('defines S1–S7 topology with Merge fan-in on Planner/Coder feedback', () => {
		const scenario = codingAgentWorkflow();
		const planner = scenario.graph.nodes.find(
			(node) => node.id === 'planner',
		);
		const coder = scenario.graph.nodes.find((node) => node.id === 'coder');

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(planner?.params.rolePreset).toBe('plan');
		expect(coder?.params.rolePreset).toBe('coder');
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
			scenario.graph.nodes.filter((node) => node.type === 'common-merge'),
		).toHaveLength(2);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-planner-merge-feedback',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-resultgate-planner-merge',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-plangate-coder',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some((edge) => edge.edgeId === 'e-qa-review'),
		).toBe(true);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-resultgate-done',
			),
		).toBe(true);
		// Single wire into planner.feedback / coder.feedback (via Merge).
		expect(
			scenario.graph.edges.filter(
				(edge) =>
					edge.toNodeId === 'planner' &&
					edge.toPort[0] === 'feedback',
			),
		).toHaveLength(1);
		expect(
			scenario.graph.edges.filter(
				(edge) =>
					edge.toNodeId === 'coder' && edge.toPort[0] === 'feedback',
			),
		).toHaveLength(1);
	});

	it('demo coding-agent.json keeps common-review (real-LLM path)', async () => {
		const raw = await fs.readFile(DEMO_WORKFLOW, 'utf8');
		const demo = JSON.parse(raw) as {
			readonly metadata: { readonly name?: string };
			readonly graph: {
				readonly nodes: readonly {
					readonly id: string;
					readonly type: string;
				}[];
				readonly edges: readonly { readonly edgeId: string }[];
			};
		};

		expect(
			demo.graph.nodes.some((node) => node.type === 'common-review'),
		).toBe(true);
		expect(
			demo.graph.nodes.some((node) => node.type === 'common-openai-llm'),
		).toBe(true);
		expect(
			demo.graph.nodes.some((node) => node.type === 'common-merge'),
		).toBe(true);
		expect(
			demo.graph.edges.some(
				(edge) => edge.edgeId === 'e-resultgate-planner-merge',
			),
		).toBe(true);
	});

	describe.skipIf(!scenarioReadyById(SCENARIO_ID))('runtime', () => {
		let projectDir: string;
		let urls: TestServerHandle;
		let client: LangflowerWsClient;

		beforeAll(async () => {
			projectDir = await createTempProject();
			await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
			await fs.writeFile(
				path.join(projectDir, 'src', 'greet.ts'),
				GREET_SOURCE,
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

		it('clarify → plan gate → coder → principles → result → Finish', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				codingAgentWorkflow(),
			);

			const allowSub = autoAllowPermissions(client);

			// Subscribe before start — red-team / coder / qa may emit
			// before the test awaits them (fan-out races).
			const plannerReady = waitForRunnerOutput(client, {
				nodeId: 'planner',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' && value.includes('Draft plan'),
			});
			const redTeamReady = waitForRunnerOutput(client, {
				nodeId: 'red-team',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' && value.includes('Attack'),
			});
			const coderReady = waitForRunnerOutput(client, {
				nodeId: 'coder',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' && value.includes('src/greet.ts'),
			});
			const qaReady = waitForRunnerOutput(client, {
				nodeId: 'qa',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' && value.includes('PASS'),
			});
			const finishPromise = waitForRunnerOutput(client, {
				nodeId: 'done',
				portId: 'value',
				predicate: (value) =>
					typeof value === 'string' && value.length > 0,
			});
			const donePromise = waitForRunnerDone(client);

			const started$ = firstValueFrom(
				client['runner.started'].pipe(take(1)),
			);

			await sendHitlInput(client, {
				nodeId: 'goal',
				portId: 'message',
				payload:
					'Fix greet() in src/greet.ts so it returns Hello, Langflower!',
			});
			const runId = await started$;

			await plannerReady;
			await sendHitlInput(
				client,
				{
					nodeId: 'ask',
					portId: 'requestChanges',
					payload: 'Only src/greet.ts; keep the export.',
				},
				runId,
			);

			await redTeamReady;

			await sendHitlInput(
				client,
				{
					nodeId: 'plan-gate',
					portId: 'approve',
					payload: true,
				},
				runId,
			);

			await coderReady;
			await qaReady;

			await sendHitlInput(
				client,
				{
					nodeId: 'review',
					portId: 'approve',
					payload: true,
				},
				runId,
			);

			await sendHitlInput(
				client,
				{
					nodeId: 'result-gate',
					portId: 'approve',
					payload: true,
				},
				runId,
			);

			const finish = await finishPromise;
			await donePromise;
			allowSub.unsubscribe();

			expect(String(finish[3].value).length).toBeGreaterThan(0);

			const greet = await fs.readFile(
				path.join(projectDir, 'src', 'greet.ts'),
				'utf8',
			);
			expect(greet).toContain('Hello, Langflower!');
			expect(greet).not.toContain('Hello, world!');
		}, 45_000);
	});
});
