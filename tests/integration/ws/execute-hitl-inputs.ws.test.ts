import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
import {
	hitlReviewApproveWorkflow,
	hitlReviewFeedbackWorkflow,
} from '../helpers/scenarios/hitl.js';
import { firstValueFrom, take } from 'rxjs';

describe('execute HITL inputs (WS bridge)', () => {
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

	describe.skipIf(!scenarioReadyById('hitl-review-approve'))(
		'review approve',
		() => {
			it('approve button emits reviewed result on response port', async () => {
				await seedWorkflowFromDisk(
					client,
					projectDir,
					hitlReviewApproveWorkflow(),
				);

				const previewPromise = waitForRunnerOutput(client, {
					nodeId: 'preview-1',
					portId: 'text',
					predicate: (value) => value === 'approved draft',
				});

				client['runner.start.requested'].next([]);
				const runId = await firstValueFrom(
					client['runner.started'].pipe(take(1)),
				);

				await sendHitlInput(
					client,
					{
						nodeId: 'review-1',
						portId: 'approve',
						payload: true,
					},
					runId,
				);

				const preview = await previewPromise;
				expect(preview[3].value).toBe('approved draft');
			});
		},
	);

	describe.skipIf(!scenarioReadyById('hitl-review-feedback'))(
		'review feedback',
		() => {
			it('request-changes textarea emits feedback port', async () => {
				await seedWorkflowFromDisk(
					client,
					projectDir,
					hitlReviewFeedbackWorkflow(),
				);

				const previewPromise = waitForRunnerOutput(client, {
					nodeId: 'preview-1',
					portId: 'text',
					predicate: (value) => value === 'fix the intro',
				});

				client['runner.start.requested'].next([]);
				const runId = await firstValueFrom(
					client['runner.started'].pipe(take(1)),
				);

				await sendHitlInput(
					client,
					{
						nodeId: 'review-1',
						portId: 'requestChanges',
						payload: 'fix the intro',
					},
					runId,
				);

				const preview = await previewPromise;
				expect(preview[3].value).toBe('fix the intro');
			});
		},
	);
});
