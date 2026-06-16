import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { filter, firstValueFrom, take } from 'rxjs';
import {
	createLangflowerWsClient,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	interruptRunner,
	type LangflowerWsClient,
	waitForRunnerDone,
	waitForRunnerOutput,
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
import { checkpointResumeWorkflow } from '../helpers/scenarios/smoke.js';

/**
 * Explicit checkpoint boundaries (ADR-018 D): persist only when
 * `common-checkpoint` / `createCheckpoint` fires; Stop without a boundary
 * does not create a resume point.
 */
describe('execute checkpoint resume (WS bridge)', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeEach(async () => {
		projectDir = await createTempProject();
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
	});

	afterEach(async () => {
		client.close();
		// Allow in-flight checkpoint writes to settle before deleting the
		// temp project (Windows rename races otherwise become unhandled ENOENT).
		await new Promise((resolve) => setTimeout(resolve, 50));
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('stop mid-run, restart server, continue without redoing stage A', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			checkpointResumeWorkflow(),
		);

		const previewA$ = waitForRunnerOutput(client, {
			nodeId: 'preview-a',
			portId: 'text',
		});
		const checkpointed$ = firstValueFrom(
			client['runner.checkpointed'].pipe(
				filter(
					(summary) =>
						summary.completedNodeIds.includes('checkpoint-a') &&
						summary.status === 'running' &&
						summary.label === 'After stage A',
				),
				take(1),
			),
		);

		client['runner.start.requested'].next([]);
		await Promise.all([previewA$, checkpointed$]);

		const stopped$ = firstValueFrom(
			client['runner.checkpoints.snapshot'].pipe(
				filter((snapshot) =>
					snapshot.checkpoints.some(
						(entry) =>
							entry.status === 'stopped' &&
							entry.completedNodeIds.includes('checkpoint-a') &&
							entry.label === 'After stage A',
					),
				),
				take(1),
			),
		);
		await interruptRunner(client);
		await stopped$;

		const runDir = path.join(
			projectDir,
			'.langflower',
			'runs',
			'checkpoint-resume',
		);
		const runIds = await fs.readdir(runDir);
		expect(runIds.length).toBeGreaterThan(0);
		const checkpointPath = path.join(runDir, runIds[0]!, 'checkpoint.json');
		const onDisk = JSON.parse(
			await fs.readFile(checkpointPath, 'utf8'),
		) as {
			status: string;
			completedNodeIds: string[];
			label?: string;
		};
		expect(onDisk.status).toBe('stopped');
		expect(onDisk.label).toBe('After stage A');
		expect(onDisk.completedNodeIds).toContain('preview-a');
		expect(onDisk.completedNodeIds).toContain('checkpoint-a');
		expect(onDisk.completedNodeIds).not.toContain('preview-b');

		client.close();
		await stopTestServer(urls);

		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		const bootstrapCheckpoints$ = firstValueFrom(
			client['runner.checkpoints.snapshot'].pipe(
				filter((snapshot) =>
					snapshot.checkpoints.some(
						(entry) =>
							entry.status === 'stopped' &&
							entry.label === 'After stage A',
					),
				),
				take(1),
			),
		);
		await waitSessionReady(client);
		const bootstrapCheckpoints = await bootstrapCheckpoints$;
		expect(bootstrapCheckpoints.workflowId).toBe('checkpoint-resume');

		const stageAValues: unknown[] = [];
		const stageASub = client['runner.output-emitted'].subscribe((event) => {
			if (
				event.kind === 'output-emitted' &&
				event.nodeId === 'stage-a' &&
				event.state === 'value'
			) {
				stageAValues.push(event.value);
			}
		});

		const previewB$ = waitForRunnerOutput(client, {
			nodeId: 'preview-b',
			portId: 'text',
		});
		const done$ = waitForRunnerDone(client);
		const resumeStarted$ = firstValueFrom(
			client['runner.resume.started'].pipe(take(1)),
		);

		const chosen = bootstrapCheckpoints.checkpoints.find(
			(entry) =>
				entry.status === 'stopped' && entry.label === 'After stage A',
		);
		expect(chosen).toBeDefined();

		client['runner.resume.requested'].next({ runId: chosen!.runId });
		const [resumeRunId, previewB, done] = await Promise.all([
			resumeStarted$,
			previewB$,
			done$,
		]);

		expect(resumeRunId).toBeTruthy();
		expect(previewB.value).toBe('checkpoint-ok');
		expect(done.runId).toBe(resumeRunId);
		// Snapshot replay may emit stage-a once; a full re-run would also
		// wait on the delay — assert we did not get a second live activation
		// beyond the single resume overlay emission.
		expect(stageAValues.length).toBeLessThanOrEqual(1);

		stageASub.unsubscribe();
	});

	it('rejects corrupt checkpoint with runner.resume.failed', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			checkpointResumeWorkflow(),
		);

		const runId = 'corrupt-run';
		const dir = path.join(
			projectDir,
			'.langflower',
			'runs',
			'checkpoint-resume',
			runId,
		);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(
			path.join(dir, 'checkpoint.json'),
			'{ not-json',
			'utf8',
		);

		client.close();
		await stopTestServer(urls);
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);

		const failed$ = firstValueFrom(
			client['runner.resume.failed'].pipe(take(1)),
		);
		client['runner.resume.requested'].next({ runId });
		const failed = await failed$;

		expect(failed.code).toBe('CORRUPT');
		expect(failed.runId).toBe(runId);
	});

	it('fingerprint mismatch → stale summary, STALE_WORKFLOW, Discard', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			checkpointResumeWorkflow(),
		);

		const runId = 'stale-run';
		const dir = path.join(
			projectDir,
			'.langflower',
			'runs',
			'checkpoint-resume',
			runId,
		);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(
			path.join(dir, 'checkpoint.json'),
			`${JSON.stringify(
				{
					schemaVersion: 1,
					runId,
					workflowId: 'checkpoint-resume',
					workflowFingerprint: 'v1:intentionally-stale::',
					updatedAt: '2026-07-20T12:00:00.000Z',
					status: 'stopped',
					label: 'After stage A',
					completedNodeIds: ['preview-a', 'checkpoint-a'],
					outputSnapshots: {
						'preview-a': {
							text: { state: 'value', value: 'checkpoint-ok' },
						},
						'checkpoint-a': {
							value: { state: 'value', value: 'checkpoint-ok' },
						},
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		client.close();
		await stopTestServer(urls);
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);

		const staleSnapshot$ = firstValueFrom(
			client['runner.checkpoints.snapshot'].pipe(
				filter((snapshot) =>
					snapshot.checkpoints.some(
						(entry) =>
							entry.runId === runId && entry.stale === true,
					),
				),
				take(1),
			),
		);
		await waitSessionReady(client);
		const staleSnapshot = await staleSnapshot$;
		const staleEntry = staleSnapshot.checkpoints.find(
			(entry) => entry.runId === runId,
		);
		expect(staleEntry?.stale).toBe(true);
		expect(staleEntry?.label).toBe('After stage A');

		const failed$ = firstValueFrom(
			client['runner.resume.failed'].pipe(take(1)),
		);
		client['runner.resume.requested'].next({ runId });
		const failed = await failed$;
		expect(failed.code).toBe('STALE_WORKFLOW');
		expect(failed.runId).toBe(runId);

		const discarded$ = firstValueFrom(
			client['runner.checkpoints.snapshot'].pipe(
				filter(
					(snapshot) =>
						!snapshot.checkpoints.some(
							(entry) => entry.runId === runId,
						),
				),
				take(1),
			),
		);
		client['runner.checkpoint.discard.requested'].next({ runId });
		const afterDiscard = await discarded$;
		expect(
			afterDiscard.checkpoints.some((entry) => entry.runId === runId),
		).toBe(false);
	});
});
