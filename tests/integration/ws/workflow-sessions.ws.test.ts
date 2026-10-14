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
	requestWorkflowLoad,
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

const sessionsDir = (projectDir: string): string =>
	path.join(projectDir, '.langflower', 'sessions');

const runsDir = (projectDir: string): string =>
	path.join(projectDir, '.langflower', 'runs');

const waitForSessionFeed = async (
	sessionDir: string,
): Promise<{
	readonly sessionId: string;
	readonly label: string;
	readonly runId: string;
}> => {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		const names = await fs.readdir(sessionDir).catch(() => [] as string[]);
		const fileName = names.find((name) => name.endsWith('.json'));
		const feedName = names.find((name) => name.endsWith('.feed.jsonl'));

		if (fileName !== undefined && feedName !== undefined) {
			const raw = JSON.parse(
				await fs.readFile(path.join(sessionDir, fileName), 'utf8'),
			) as { sessionId: string; label: string };
			const feed = await fs.readFile(
				path.join(sessionDir, feedName),
				'utf8',
			);
			const marker = feed
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
				.map((line) => JSON.parse(line) as { runId?: string })
				.find((line) => typeof line.runId === 'string');

			if (marker?.runId !== undefined) {
				return {
					sessionId: raw.sessionId,
					label: raw.label,
					runId: marker.runId,
				};
			}
		}

		await new Promise((resolve) => setTimeout(resolve, 20));
	}

	throw new Error('session feed was not flushed');
};

describe('workflow session points (WS bridge)', () => {
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
		await new Promise((resolve) => setTimeout(resolve, 50));
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('opens the last session after restart without a select click', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			checkpointResumeWorkflow(),
		);

		const checkpoint$ = waitForRunnerOutput(client, {
			nodeId: 'checkpoint-a',
			portId: 'value',
		});
		client['runner.start.requested'].next([]);
		await checkpoint$;
		await interruptRunner(client);

		const sessionDir = path.join(
			sessionsDir(projectDir),
			'checkpoint-resume',
		);
		const onDisk = await waitForSessionFeed(sessionDir);
		await expect(fs.access(runsDir(projectDir))).rejects.toThrow();

		client.close();
		await stopTestServer(urls);
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		const current$ = firstValueFrom(
			client['workflowSession.current.snapshot'].pipe(
				filter((snapshot) => snapshot.sessionId === onDisk.sessionId),
				take(1),
			),
		);
		const feed$ = firstValueFrom(
			client['executionFeed.snapshot'].pipe(
				filter(
					(snapshot) =>
						snapshot !== null && snapshot.runId === onDisk.runId,
				),
				take(1),
			),
		);
		await waitSessionReady(client);
		const [current, feed] = await Promise.all([current$, feed$]);
		expect(current.sessionId).toBe(onDisk.sessionId);
		expect(feed?.runId).toBe(onDisk.runId);

		const again$ = waitForRunnerOutput(client, {
			nodeId: 'checkpoint-a',
			portId: 'value',
		});
		client['runner.start.requested'].next([]);
		await again$;
		await interruptRunner(client);
		expect((await fs.readdir(sessionDir)).sort()).toEqual(
			[`${onDisk.label}.feed.jsonl`, `${onDisk.label}.json`].sort(),
		);
	});

	it('appends a point on the bound session and resumes by pointId', async () => {
		await seedWorkflowFromDisk(
			client,
			projectDir,
			checkpointResumeWorkflow(),
		);

		const created$ = firstValueFrom(
			client['workflowSession.current.snapshot'].pipe(
				filter((snapshot) => snapshot.sessionId !== null),
				take(1),
			),
		);
		client['workflowSession.create.requested'].next({});
		const created = await created$;
		const sessionId = created.sessionId;

		if (sessionId === null) {
			throw new Error('expected a bound session');
		}

		const pointed$ = firstValueFrom(
			client['workflowSession.current.snapshot'].pipe(
				filter((snapshot) =>
					snapshot.points.some(
						(point) => point.label === 'After stage A',
					),
				),
				take(1),
			),
		);
		const checkpoint$ = waitForRunnerOutput(client, {
			nodeId: 'checkpoint-a',
			portId: 'value',
		});
		client['runner.start.requested'].next([]);
		const [pointed] = await Promise.all([pointed$, checkpoint$]);
		const chosen = pointed.points.find(
			(point) => point.label === 'After stage A',
		);
		expect(chosen?.pointId).toEqual(expect.any(String));
		const pointId = chosen!.pointId;

		await interruptRunner(client);

		const sessionDir = path.join(
			sessionsDir(projectDir),
			'checkpoint-resume',
		);
		const names = await fs.readdir(sessionDir);
		const sessionFileName = names.find((name) => name.endsWith('.json'));

		if (sessionFileName === undefined) {
			throw new Error('expected a session file');
		}

		const sessionPath = path.join(sessionDir, sessionFileName);
		const onDisk = JSON.parse(await fs.readFile(sessionPath, 'utf8')) as {
			points: Array<{
				pointId: string;
				label?: string;
				completedNodeIds: string[];
				runId: string;
			}>;
		};
		expect(onDisk.points).toHaveLength(1);
		expect(onDisk.points[0]?.pointId).toBe(pointId);
		expect(onDisk.points[0]?.label).toBe('After stage A');
		expect(onDisk.points[0]?.completedNodeIds).toContain('checkpoint-a');
		expect(onDisk.points[0]?.completedNodeIds).not.toContain('preview-b');
		await expect(fs.access(runsDir(projectDir))).rejects.toThrow();

		client.close();
		await stopTestServer(urls);
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
		await requestWorkflowLoad(client, { workflowId: 'checkpoint-resume' });

		const selected$ = firstValueFrom(
			client['workflowSession.current.snapshot'].pipe(
				filter(
					(snapshot) =>
						snapshot.sessionId === sessionId &&
						snapshot.points.some(
							(point) => point.pointId === pointId,
						),
				),
				take(1),
			),
		);
		client['workflowSession.select.requested'].next({ sessionId });
		await selected$;

		const stageAValues: unknown[] = [];
		const stageASub = client['runner.port'].subscribe((event) => {
			if (
				event[0] === 'out' &&
				event[1] === 'stage-a' &&
				'value' in event[3]
			) {
				stageAValues.push(event[3].value);
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
		const resumedFeed$ = firstValueFrom(
			client['executionFeed.snapshot'].pipe(
				filter(
					(snapshot) =>
						snapshot !== null &&
						snapshot.runId === onDisk.points[0]?.runId,
				),
				take(1),
			),
		);

		client['runner.resume.requested'].next({ pointId });
		const [resumeRunId, previewB, done, feed] = await Promise.all([
			resumeStarted$,
			previewB$,
			done$,
			resumedFeed$,
		]);

		expect(resumeRunId).toBe(onDisk.points[0]?.runId);
		expect(feed?.runId).toBe(onDisk.points[0]?.runId);
		expect(previewB[3].value).toBe('checkpoint-ok');
		expect(done[1]).toBe(resumeRunId);
		expect(stageAValues.length).toBeLessThanOrEqual(1);
		stageASub.unsubscribe();

		const after = JSON.parse(await fs.readFile(sessionPath, 'utf8')) as {
			points: Array<{ pointId: string }>;
		};
		expect(after.points).toHaveLength(1);
		expect(after.points.some((point) => point.pointId === pointId)).toBe(
			true,
		);
		await expect(fs.access(runsDir(projectDir))).rejects.toThrow();
	});
});
