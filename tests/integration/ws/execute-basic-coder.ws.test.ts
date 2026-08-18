import fs from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeRunnerEvent } from '@langflower/runtime';
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
import { basicCoderWorkflow } from '../helpers/scenarios/agents-pilots.js';
import { firstValueFrom, take } from 'rxjs';
import {
	autoAllowPermissions,
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

const SCENARIO_ID = 'basic-coder';
const GREET_SOURCE = [
	'export const greet = (): string => {',
	"\treturn 'Hello, world!';",
	'};',
	'',
].join('\n');

describe('execute basic-coder pilot (WS bridge)', () => {
	it('defines basic-coder Chat Input→Plan→Coder scenario graph', () => {
		const scenario = basicCoderWorkflow();
		const goal = scenario.graph.nodes.find((node) => node.id === 'goal');
		const plan = scenario.graph.nodes.find((node) => node.id === 'plan');
		const coder = scenario.graph.nodes.find((node) => node.id === 'coder');

		expect(scenario.workflowId).toBe(SCENARIO_ID);
		expect(goal?.type).toBe('common-chat-input');
		expect(plan?.params.rolePreset).toBe('plan');
		expect(coder?.params.rolePreset).toBe('coder');
		expect(
			scenario.graph.edges.some((edge) => edge.edgeId === 'e-plan-coder'),
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

		it('Plan→Coder edits file; Plan write asks; Coder edit is allow-by-default', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				basicCoderWorkflow(),
			);

			const asks: RunnerPermissionAskPayload[] = [];
			const askSub = client['runner.permission.ask'].subscribe(
				(ask: RunnerPermissionAskPayload) => {
					asks.push(ask);
				},
			);
			const allowSub = autoAllowPermissions(client);

			const toolLogs: string[] = [];
			const toolSub = client['runner.port'].subscribe(
				(event: RuntimeRunnerEvent) => {
					if (
						event[0] === 'out' &&
						'value' in event[3] &&
						event[2] === 'toolLog'
					) {
						toolLogs.push(String(event[3].value));
					}
				},
			);

			const outputPromise = waitForRunnerOutput(client, {
				nodeId: 'summary',
				portId: 'text',
				predicate: (value) =>
					typeof value === 'string' && value.includes('src/greet.ts'),
			});
			const started$ = firstValueFrom(
				client['runner.started'].pipe(take(1)),
			);

			await sendHitlInput(client, {
				nodeId: 'goal',
				portId: 'message',
				payload:
					'Fix greet() in src/greet.ts so it returns Hello, Langflower!',
			});
			await started$;
			const output = await outputPromise;

			askSub.unsubscribe();
			allowSub.unsubscribe();
			toolSub.unsubscribe();

			expect(String(output[3].value)).toContain('src/greet.ts');
			expect(asks.some((ask) => ask.toolId === 'write')).toBe(true);
			expect(asks.some((ask) => ask.toolId === 'edit')).toBe(false);
			expect(toolLogs.some((line) => line.includes('→ write'))).toBe(
				true,
			);
			expect(toolLogs.some((line) => line.includes('→ edit'))).toBe(true);

			const planNote = await fs.readFile(
				path.join(projectDir, 'plans', 'fix.md'),
				'utf8',
			);
			expect(planNote).toContain('src/greet.ts');

			const greet = await fs.readFile(
				path.join(projectDir, 'src', 'greet.ts'),
				'utf8',
			);
			expect(greet).toContain('Hello, Langflower!');
			expect(greet).not.toContain('Hello, world!');
		});
	});
});
