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

const readCompletedLog = async (logsDir: string): Promise<string> => {
	for (let attempt = 0; attempt < 20; attempt++) {
		const files = await fs.readdir(logsDir);
		const logFile = files.find((file) => file.endsWith('.log'));

		if (logFile !== undefined) {
			const text = await fs.readFile(path.join(logsDir, logFile), 'utf8');
			if (text.includes('"kind":"server-closing"')) {
				return text;
			}
		}

		await new Promise<void>((resolve) => {
			setTimeout(resolve, 20);
		});
	}

	throw new Error('Timed out waiting for the server diagnostic log to flush');
};

describe('server bridge diagnostic log', () => {
	let projectDir: string;
	let server: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		projectDir = await createTempProject();
		server = await startTestServer({ projectDir });
		client = createLangflowerWsClient(server.wsUrl);
		await waitSessionReady(client);
	});

	it('records decoded inbound and bootstrap/unicast bridge frames', async () => {
		const catalog = firstValueFrom(
			client['workflow.list.snapshot'].pipe(take(1)),
		);
		client['workflow.list.requested'].next({});
		await catalog;
	});

	afterAll(async () => {
		client.close();
		await stopTestServer(server);

		const text = await readCompletedLog(
			path.join(projectDir, '.langflower', 'logs'),
		);

		expect(text).toContain('"kind":"connection"');
		expect(text).toContain('"direction":"inbound"');
		expect(text).toContain('"type":"workflow.list.requested"');
		expect(text).toContain('"direction":"outbound"');
		expect(text).toContain('"scope":"client"');
		expect(text).toContain('"type":"workflow.list.snapshot"');

		await removeTempProject(projectDir);
	});
});
