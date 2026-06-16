import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { firstValueFrom, take } from 'rxjs';
import {
	type LangflowerWsClient,
	waitSessionReady,
	waitWorkflowListSnapshot,
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
import { createLangflowerWsClient } from './langflower-ws-client.js';

describe('project bootstrap (WS bridge)', () => {
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

	it('force-reseeds skeleton workflows without rewriting langflower.jsonc', async () => {
		const langflowerDir = path.join(projectDir, '.langflower');
		const starterPath = path.join(
			langflowerDir,
			'workflows',
			'starter.json',
		);
		const configPath = path.join(langflowerDir, 'langflower.jsonc');
		const providerMarker = {
			currentWorkflowId: 'starter',
			provider: { openai: { apiKey: 'keep-me' } },
			mcp: { servers: { local: { command: 'echo' } } },
		};

		await fs.writeFile(
			starterPath,
			'{"metadata":{"name":"stale-starter"}}\n',
			'utf8',
		);
		await fs.writeFile(
			configPath,
			`${JSON.stringify(providerMarker, null, 2)}\n`,
			'utf8',
		);

		const listPromise = waitWorkflowListSnapshot(client, (snapshot) =>
			snapshot.workflows.some(
				(entry) => entry.workflowId === 'simple-coder',
			),
		);
		const resultPromise = firstValueFrom(
			client['project.bootstrap.result'].pipe(take(1)),
		);

		client['project.bootstrap.requested'].next({});

		const [result, list] = await Promise.all([resultPromise, listPromise]);

		expect(result).toEqual({ ok: true });
		expect(
			list.workflows.some((entry) => entry.workflowId === 'simple-coder'),
		).toBe(true);

		const starter = JSON.parse(await fs.readFile(starterPath, 'utf8')) as {
			metadata: { name: string };
		};
		expect(starter.metadata.name).toBe('Starter');
		expect(JSON.parse(await fs.readFile(configPath, 'utf8'))).toEqual(
			providerMarker,
		);
	});
});
