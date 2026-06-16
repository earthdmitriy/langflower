import fs from 'node:fs/promises';
import path from 'node:path';
import { firstValueFrom, take, filter, timeout } from 'rxjs';
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
	waitSessionReady,
	type LangflowerWsClient,
} from '@langflower/shared/langflower-ws-waits';
import type { LangflowerConfigDraftSnapshotPayload } from '@langflower/shared/langflower.js';

const waitDraft = (
	client: LangflowerWsClient,
	predicate: (snap: LangflowerConfigDraftSnapshotPayload) => boolean,
): Promise<LangflowerConfigDraftSnapshotPayload> =>
	firstValueFrom(
		client['langflower.config.draft.snapshot'].pipe(
			filter(predicate),
			take(1),
			timeout(10_000),
		),
	);

describe('settings config draft (WS bridge)', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		projectDir = await createTempProject();
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
	}, 30_000);

	afterAll(async () => {
		client.close();
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('bootstrap emits draft.snapshot for the active settings scope', async () => {
		const clientB = createLangflowerWsClient(urls.wsUrl);
		const draft = await waitDraft(clientB, () => true);
		expect(draft.scope).toMatch(/^(project|global)$/);
		expect(draft.dirty).toBe(false);
		expect(draft.draft.providers.every((row) => row.apiKey === '')).toBe(
			true,
		);
		clientB.close();
	});

	it('draft.patch broadcasts the same unsaved fields to all tabs', async () => {
		const clientB = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(clientB);

		client['editor.settings.requested'].next({
			open: true,
			scope: 'project',
		});

		const nextB$ = waitDraft(
			clientB,
			(snap) =>
				snap.scope === 'project' &&
				snap.dirty &&
				snap.draft.providers.some((row) => row.id === 'draft-a'),
		);
		const nextA$ = waitDraft(
			client,
			(snap) =>
				snap.scope === 'project' &&
				snap.dirty &&
				snap.draft.providers.some((row) => row.id === 'draft-a'),
		);

		client['langflower.config.draft.patch.requested'].next({
			scope: 'project',
			draft: {
				defaultProviderId: '',
				defaultModelId: '',
				serverLogs: 'default',
				providers: [
					{
						id: 'draft-a',
						name: 'Draft A',
						baseURL: '',
						modelsText: 'm1',
						apiKey: '',
						hasApiKey: false,
					},
				],
			},
		});

		const [a, b] = await Promise.all([nextA$, nextB$]);
		expect(a.draft.providers[0]?.name).toBe('Draft A');
		expect(b.draft.providers[0]?.name).toBe('Draft A');
		expect(a.connections['0']?.state).toBe('idle');

		clientB.close();
	});

	it('URL patch moves connection through checking then ok or error', async () => {
		const checking$ = waitDraft(
			client,
			(snap) =>
				snap.scope === 'project' &&
				snap.connections['0']?.state === 'checking',
		);
		const settled$ = waitDraft(
			client,
			(snap) =>
				snap.scope === 'project' &&
				(snap.connections['0']?.state === 'ok' ||
					snap.connections['0']?.state === 'error'),
		);

		client['langflower.config.draft.patch.requested'].next({
			scope: 'project',
			draft: {
				defaultProviderId: '',
				defaultModelId: '',
				serverLogs: 'default',
				providers: [
					{
						id: 'draft-a',
						name: 'Draft A',
						baseURL: 'http://127.0.0.1:9/v1',
						modelsText: 'm1',
						apiKey: '',
						hasApiKey: false,
					},
				],
			},
		});

		await checking$;
		const settled = await settled$;
		expect(['ok', 'error']).toContain(settled.connections['0']?.state);
	});

	it('discard restores pristine draft', async () => {
		const pristine$ = waitDraft(
			client,
			(snap) => snap.scope === 'project' && snap.dirty === false,
		);

		client['langflower.config.draft.discard.requested'].next({
			scope: 'project',
		});

		const snap = await pristine$;
		expect(snap.draft.providers.every((row) => row.id !== 'draft-a')).toBe(
			true,
		);
	});
});

describe('settings config draft seed probe (WS bridge)', () => {
	let projectDir: string;
	let urls: TestServerHandle;
	let client: LangflowerWsClient;

	beforeAll(async () => {
		projectDir = await createTempProject();
		await fs.writeFile(
			path.join(projectDir, '.langflower', 'langflower.jsonc'),
			`${JSON.stringify(
				{
					provider: {
						local: {
							name: 'Local',
							models: ['m1'],
							options: {
								baseURL: 'http://127.0.0.1:9/v1',
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		await waitSessionReady(client);
	}, 30_000);

	afterAll(async () => {
		client.close();
		await stopTestServer(urls);
		await removeTempProject(projectDir);
	});

	it('probes saved Base URL on draft seed without requiring an edit', async () => {
		const withProvider$ = waitDraft(
			client,
			(snap) =>
				snap.scope === 'project' &&
				snap.draft.providers.some((row) => row.id === 'local'),
		);

		client['editor.settings.requested'].next({
			open: true,
			scope: 'project',
		});

		const withProvider = await withProvider$;
		const rowIndex = withProvider.draft.providers.findIndex(
			(row) => row.id === 'local',
		);
		expect(rowIndex).toBeGreaterThanOrEqual(0);
		expect(
			withProvider.draft.providers[rowIndex]?.baseURL.length,
		).toBeGreaterThan(0);

		// Seed must not leave the empty-URL idle hint when Base URL is set.
		const key = String(rowIndex);
		expect(withProvider.connections[key]?.state).not.toBe('idle');

		const terminal = await waitDraft(
			client,
			(snap) =>
				snap.scope === 'project' &&
				(snap.connections[key]?.state === 'ok' ||
					snap.connections[key]?.state === 'error'),
		);
		expect(['ok', 'error']).toContain(terminal.connections[key]?.state);
	}, 30_000);
});
