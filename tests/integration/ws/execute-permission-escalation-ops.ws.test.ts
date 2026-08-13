import fs from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeRunnerEvent } from '@langflower/runtime';
import type { RunnerPermissionAskPayload } from '@langflower/shared/langflower.js';
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
import { permissionEscalationOpsWorkflow } from '../helpers/scenarios/agents-pilots.js';
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

const SCENARIO_ID = 'permission-escalation-ops';
const GREET_SOURCE = [
	'export const greet = (): string => {',
	"\treturn 'Hello, world!';",
	'};',
	'',
].join('\n');

describe('execute permission-escalation-ops (WS bridge)', () => {
	it('defines explore → write → bash staged topology (no mid-run tier)', () => {
		const scenario = permissionEscalationOpsWorkflow();
		const explore = scenario.graph.nodes.find(
			(node) => node.id === 'explore',
		);
		const write = scenario.graph.nodes.find((node) => node.id === 'write');
		const bash = scenario.graph.nodes.find((node) => node.id === 'bash');
		const writeTools = write?.params.enabledToolIds as
			readonly string[] | undefined;

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(explore?.params.rolePreset).toBe('plan');
		expect(write?.params.rolePreset).toBe('coder');
		expect(bash?.params.rolePreset).toBe('coder');
		expect(writeTools).toBeDefined();
		expect(writeTools).not.toContain('bash');
		expect(writeTools).toContain('edit');
		expect(bash?.params.enabledToolIds).toBeUndefined();
		expect(
			scenario.graph.nodes.some(
				(node) => node.type === 'common-fake-llm',
			),
		).toBe(true);
		expect(
			scenario.graph.nodes.filter(
				(node) => node.type === 'common-hitl-review-gate',
			),
		).toHaveLength(2);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-write-gate-write',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some(
				(edge) => edge.edgeId === 'e-bash-gate-bash',
			),
		).toBe(true);
		expect(
			scenario.graph.edges.some((edge) => edge.edgeId === 'e-bash-done'),
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

		it('explore → write gate → write → bash gate → bash → Finish', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				permissionEscalationOpsWorkflow(),
			);

			const asks: RunnerPermissionAskPayload[] = [];
			const askSub = client['runner.permission.ask'].subscribe(
				(ask: RunnerPermissionAskPayload) => {
					asks.push(ask);
				},
			);
			const allowSub = autoAllowPermissions(client);

			const toolLogsByNode = new Map<string, string[]>();
			const toolSub = client['runner.port'].subscribe(
				(event: RuntimeRunnerEvent) => {
					if (
						event[0] === 'out' &&
						event[3] === 'value' &&
						event[2] === 'toolLog'
					) {
						const lines = toolLogsByNode.get(event[1]) ?? [];
						lines.push(String(event[4]));
						toolLogsByNode.set(event[1], lines);
					}
				},
			);

			const exploreReady = waitForRunnerOutput(client, {
				nodeId: 'explore',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' && value.includes('Explore:'),
			});
			const writeReady = waitForRunnerOutput(client, {
				nodeId: 'write',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' && value.includes('Write:'),
			});
			const bashReady = waitForRunnerOutput(client, {
				nodeId: 'bash',
				portId: 'response',
				predicate: (value) =>
					typeof value === 'string' && value.includes('Bash:'),
			});
			const finishPromise = waitForRunnerOutput(client, {
				nodeId: 'done',
				portId: 'value',
				predicate: (value) =>
					typeof value === 'string' && value.includes('Bash:'),
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

			await exploreReady;
			await sendHitlInput(
				client,
				{
					nodeId: 'write-gate',
					portId: 'approve',
					payload: true,
				},
				runId,
			);

			await writeReady;
			await sendHitlInput(
				client,
				{
					nodeId: 'bash-gate',
					portId: 'approve',
					payload: true,
				},
				runId,
			);

			await bashReady;
			const finish = await finishPromise;
			await donePromise;

			askSub.unsubscribe();
			allowSub.unsubscribe();
			toolSub.unsubscribe();

			expect(String(finish[4])).toContain('Bash:');

			const exploreLogs = toolLogsByNode.get('explore') ?? [];
			const writeLogs = toolLogsByNode.get('write') ?? [];
			const bashLogs = toolLogsByNode.get('bash') ?? [];

			expect(exploreLogs.some((line) => line.includes('→ read'))).toBe(
				true,
			);
			expect(exploreLogs.some((line) => line.includes('→ bash'))).toBe(
				false,
			);
			expect(writeLogs.some((line) => line.includes('→ edit'))).toBe(
				true,
			);
			expect(writeLogs.some((line) => line.includes('→ bash'))).toBe(
				false,
			);
			expect(bashLogs.some((line) => line.includes('→ bash'))).toBe(true);

			// edit/write/create default allow; bash still ask (Coder posture).
			expect(asks.some((ask) => ask.toolId === 'edit')).toBe(false);
			expect(asks.some((ask) => ask.toolId === 'bash')).toBe(true);

			const greet = await fs.readFile(
				path.join(projectDir, 'src', 'greet.ts'),
				'utf8',
			);
			expect(greet).toContain('Hello, Langflower!');
			expect(greet).not.toContain('Hello, world!');
		});
	});
});
