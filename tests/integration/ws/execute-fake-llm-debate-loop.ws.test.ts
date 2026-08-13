import type { RuntimeRunnerEvent } from '@langflower/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filter, firstValueFrom, take } from 'rxjs';
import {
	createTempProject,
	removeTempProject,
} from '../helpers/temp-project.js';
import {
	startTestServer,
	stopTestServer,
	type TestServerHandle,
} from '../helpers/test-server.js';
import { fakeLlmDebateLoopWorkflow } from '../helpers/scenarios/fake-llm.js';
import {
	createLangflowerWsClient,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	interruptRunner,
	startRunner,
	type LangflowerWsClient,
	waitSessionReady,
} from '@langflower/shared/langflower-ws-waits';

describe('execute fake-llm debate loop (WS bridge)', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		projectDir = await createTempProject();
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
	});

	afterAll(async () => {
		client.close();
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('Soft emits while feedback edge is wired (no init deadlock)', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			fakeLlmDebateLoopWorkflow(),
		);

		let doneSeen = false;
		const doneSub = client['runner.done'].subscribe(() => {
			doneSeen = true;
		});

		const softFirst = firstValueFrom(
			client['runner.port'].pipe(
				filter((event: RuntimeRunnerEvent) => {
					if (
						event[0] !== 'out' ||
						event[3] !== 'value' ||
						event[1] !== 'soft' ||
						event[2] !== 'response'
					) {
						return false;
					}

					client['runner.interrupt.requested'].next('cancel');
					return true;
				}),
				take(1),
			),
		);

		await startRunner(client);
		const soft1 = await softFirst;
		expect(String(soft1[4])).toContain('Final:');
		expect(doneSeen).toBe(false);

		await interruptRunner(client).catch(() => {
			// Already interrupted from the Soft response filter.
		});

		doneSub.unsubscribe();
	}, 15_000);
});
