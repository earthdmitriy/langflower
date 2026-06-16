import { promises as fs } from 'node:fs';
import path from 'node:path';
import { firstValueFrom, take } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createTempProject,
	removeTempProject,
} from '../helpers/temp-project.js';
import {
	startTestServer,
	stopTestServer,
	type TestServerHandle,
} from '../helpers/test-server.js';
import {
	createLangflowerWsClient,
	type LangflowerWsClient,
} from './langflower-ws-client.js';
import { waitSessionReady } from '@langflower/shared/langflower-ws-waits';

describe('server bridge diagnostic log when serverLogs is false', () => {
	let projectDir: string;
	let server: TestServerHandle | undefined;
	let client: LangflowerWsClient | undefined;

	beforeAll(async () => {
		projectDir = await createTempProject();
		const configPath = path.join(
			projectDir,
			'.langflower',
			'langflower.jsonc',
		);
		const existing = JSON.parse(
			await fs.readFile(configPath, 'utf8'),
		) as Record<string, unknown>;
		await fs.writeFile(
			configPath,
			`${JSON.stringify({ ...existing, serverLogs: false }, null, '\t')}\n`,
			'utf8',
		);

		server = await startTestServer({ projectDir });
		client = createLangflowerWsClient(server.wsUrl);
		await waitSessionReady(client);
	});

	afterAll(async () => {
		client?.close();
		await stopTestServer(server);
		await removeTempProject(projectDir);
	});

	it('does not create a logs file while disabled', async () => {
		const activeClient = client;
		if (activeClient === undefined) {
			throw new Error('client not started');
		}

		const catalog = firstValueFrom(
			activeClient['workflow.list.snapshot'].pipe(take(1)),
		);
		activeClient['workflow.list.requested'].next({});
		await catalog;

		// Give the async config gate + any deferred writes a beat, then close.
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 50);
		});

		activeClient.close();
		client = undefined;
		await stopTestServer(server);
		server = undefined;

		const logsDir = path.join(projectDir, '.langflower', 'logs');
		await expect(fs.readdir(logsDir)).rejects.toMatchObject({
			code: 'ENOENT',
		});
	});
});
