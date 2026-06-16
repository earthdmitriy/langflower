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

describe('editor settings aside (WS bridge)', () => {
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

	it('session.state.snapshot includes settings; empty providers open Global', async () => {
		const clientB = createLangflowerWsClient(urls.wsUrl);
		const snapshot = await waitSessionSnapshot(clientB);

		expect(snapshot.settings).toEqual(
			expect.objectContaining({
				open: expect.any(Boolean),
				scope: expect.stringMatching(/^(project|global)$/),
			}),
		);

		// Effective merge may include the host's global providers; when empty,
		// bootstrap onboarding must force Global Settings open.
		if (
			Object.keys(snapshot.langflowerConfig.provider ?? {}).length === 0
		) {
			expect(snapshot.settings).toEqual({
				open: true,
				scope: 'global',
			});
		}

		clientB.close();
	});

	it('settings.requested broadcasts editor.settings.snapshot to all tabs', async () => {
		const clientB = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(clientB);

		const nextB$ = firstValueFrom(
			clientB['editor.settings.snapshot'].pipe(take(1)),
		);
		const nextA$ = firstValueFrom(
			client['editor.settings.snapshot'].pipe(take(1)),
		);

		client['editor.settings.requested'].next({
			open: true,
			scope: 'global',
		});

		await expect(nextA$).resolves.toEqual({
			open: true,
			scope: 'global',
		});
		await expect(nextB$).resolves.toEqual({
			open: true,
			scope: 'global',
		});

		const closedA$ = firstValueFrom(
			client['editor.settings.snapshot'].pipe(take(1)),
		);
		const closedB$ = firstValueFrom(
			clientB['editor.settings.snapshot'].pipe(take(1)),
		);
		client['editor.settings.requested'].next({ open: false });

		await expect(closedA$).resolves.toEqual({
			open: false,
			scope: 'global',
		});
		await expect(closedB$).resolves.toEqual({
			open: false,
			scope: 'global',
		});

		clientB.close();
	});

	it('open without scope is ignored (no snapshot)', async () => {
		const next$ = firstValueFrom(
			client['editor.settings.snapshot'].pipe(take(1)),
		);

		client['editor.settings.requested'].next({ open: true });

		client['editor.settings.requested'].next({
			open: true,
			scope: 'project',
		});

		await expect(next$).resolves.toEqual({
			open: true,
			scope: 'project',
		});
	});

	it('selecting a node while Settings open closes Settings', async () => {
		const opened$ = firstValueFrom(
			client['editor.settings.snapshot'].pipe(take(1)),
		);
		client['editor.settings.requested'].next({
			open: true,
			scope: 'global',
		});
		await expect(opened$).resolves.toEqual({
			open: true,
			scope: 'global',
		});

		const settingsClosed$ = firstValueFrom(
			client['editor.settings.snapshot'].pipe(take(1)),
		);

		client['editor.selectNode.requested'].next({ nodeId: 'string-1' });

		await expect(settingsClosed$).resolves.toEqual({
			open: false,
			scope: 'global',
		});
	});
});
