import fs from 'node:fs/promises';
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
import { createLangflowerWsClient } from './langflower-ws-client.js';
import {
	requestWorkflowLoad,
	waitSessionReady,
	waitSessionSnapshot,
	type LangflowerWsClient,
} from '@langflower/shared/langflower-ws-waits';

describe('editor palette visibility (WS bridge)', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		projectDir = await createTempProject();
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
		await requestWorkflowLoad(client, { workflowId: 'example' });
	}, 30_000);

	afterAll(async () => {
		client.close();
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('session.state.snapshot includes paletteVisible default true', async () => {
		const clientB = createLangflowerWsClient(urls.wsUrl);
		const snapshot = await waitSessionSnapshot(clientB);

		expect(snapshot.paletteVisible).toBe(true);
		clientB.close();
	});

	it('paletteVisible.requested broadcasts snapshot to all tabs and persists jsonc', async () => {
		const clientB = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(clientB);

		const nextB$ = firstValueFrom(
			clientB['editor.paletteVisible.snapshot'].pipe(take(1)),
		);
		const nextA$ = firstValueFrom(
			client['editor.paletteVisible.snapshot'].pipe(take(1)),
		);

		client['editor.paletteVisible.requested'].next(false);

		await expect(nextA$).resolves.toBe(false);
		await expect(nextB$).resolves.toBe(false);

		const configPath = path.join(
			projectDir,
			'.langflower',
			'langflower.jsonc',
		);

		await expect
			.poll(async () => {
				const raw = JSON.parse(
					await fs.readFile(configPath, 'utf8'),
				) as {
					readonly paletteVisible?: boolean;
				};
				return raw.paletteVisible;
			})
			.toBe(false);

		clientB.close();
	});

	it('ignores non-boolean payloads', async () => {
		const seen: boolean[] = [];
		const sub = client['editor.paletteVisible.snapshot'].subscribe(
			(value) => {
				seen.push(value);
			},
		);

		(
			client['editor.paletteVisible.requested'] as {
				next: (value: unknown) => void;
			}
		).next('no');

		await new Promise<void>((resolve) => {
			setTimeout(resolve, 50);
		});
		expect(seen).toEqual([]);

		sub.unsubscribe();
	});

	it('reconnect hydrates paletteVisible from jsonc', async () => {
		client['editor.paletteVisible.requested'].next(false);
		await firstValueFrom(
			client['editor.paletteVisible.snapshot'].pipe(take(1)),
		);

		const configPath = path.join(
			projectDir,
			'.langflower',
			'langflower.jsonc',
		);
		await expect
			.poll(async () => {
				const raw = JSON.parse(
					await fs.readFile(configPath, 'utf8'),
				) as {
					readonly paletteVisible?: boolean;
				};
				return raw.paletteVisible;
			})
			.toBe(false);

		const clientC = createLangflowerWsClient(urls.wsUrl);
		const snapshot = await waitSessionSnapshot(clientC);
		expect(snapshot.paletteVisible).toBe(false);
		clientC.close();
	});
});
