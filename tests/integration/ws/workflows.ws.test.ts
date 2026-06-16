import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { filter, firstValueFrom, take } from 'rxjs';
import {
	createLangflowerWsClient,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	requestWorkflowDelete,
	requestWorkflowDeleteSnapshot,
	requestWorkflowList,
	requestWorkflowLoad,
	requestWorkflowLoadSnapshot,
	requestWorkflowSaveCurrent,
	type LangflowerWsClient,
	waitSessionReady,
	waitWorkflowCurrentSnapshot,
	waitWorkflowListSnapshot,
} from '@langflower/shared/langflower-ws-waits';
import {
	createTempProject,
	removeTempProject,
	writeWorkflowDocument,
} from '../helpers/temp-project.js';
import {
	startTestServer,
	stopTestServer,
	type TestServerHandle,
} from '../helpers/test-server.js';
import { stringPreviewWorkflow } from '../helpers/scenarios/smoke.js';

describe('workflow manager (WS bridge)', () => {
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

	describe('connect bootstrap', () => {
		it('includes workflow catalog in workflow.list.snapshot', async () => {
			const freshClient = createLangflowerWsClient(urls.wsUrl);
			const currentSnapshotPromise = waitWorkflowCurrentSnapshot(
				freshClient,
				(s) => s.activeWorkflow !== null,
			);
			await waitSessionReady(freshClient);

			const { workflows } = await requestWorkflowList(freshClient);
			expect(
				workflows.some((entry) => entry.workflowId === 'example'),
			).toBe(true);

			const currentSnapshot = await currentSnapshotPromise;
			expect(currentSnapshot.currentStatus.status).toBe('pristine');

			freshClient.close();
		});

		it('loads currentWorkflowId from langflower.jsonc into session', async () => {
			const freshClient = createLangflowerWsClient(urls.wsUrl);
			const currentSnapshotPromise = waitWorkflowCurrentSnapshot(
				freshClient,
				(s) => s.activeWorkflow !== null,
			);
			await waitSessionReady(freshClient);

			const currentSnapshot = await currentSnapshotPromise;
			expect(currentSnapshot.activeWorkflow?.workflowId).toBe('starter');

			freshClient.close();
		});
	});

	describe('catalog list intent', () => {
		it('lists bootstrapped example workflow', async () => {
			const { workflows } = await requestWorkflowList(client);

			expect(
				workflows.some((entry) => entry.workflowId === 'example'),
			).toBe(true);
		});
	});

	describe('saveCurrent pushes catalog update', () => {
		it('broadcasts workflow.list.snapshot after save without list request', async () => {
			await writeWorkflowDocument(projectDir, {
				workflowId: 'broken',
				metadata: {
					name: 'broken',
					createdAt: '2026-06-17T00:00:00.000Z',
					updatedAt: '2026-06-17T00:00:00.000Z',
				},
				graph: {
					viewport: { x: 0, y: 0, scale: 1 },
					nodes: [],
					edges: [],
				},
			});
			await fs.writeFile(
				path.join(
					projectDir,
					'.langflower',
					'workflows',
					'corrupt.json',
				),
				'not-json',
				'utf8',
			);

			await requestWorkflowLoad(client, { workflowId: 'example' });

			const listPromise = firstValueFrom(
				client['workflow.list.snapshot'].pipe(take(1)),
			);

			await requestWorkflowSaveCurrent(client);

			const { workflows } = await listPromise;
			expect(
				workflows.some((entry) => entry.workflowId === 'example'),
			).toBe(true);
		});

		it('persists saveCurrent workflow to disk', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				stringPreviewWorkflow('saved-via-ws'),
			);
			await requestWorkflowSaveCurrent(client);

			const loaded = await requestWorkflowLoad(client, {
				workflowId: 'smoke',
			});

			expect(loaded.workflowId).toBe('smoke');
			expect(loaded.graph.nodes[0]?.inputs.value).toBe('saved-via-ws');
		});
	});

	describe('delete pushes catalog update', () => {
		it('broadcasts workflow.list.snapshot after delete without list request', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				stringPreviewWorkflow('to-delete'),
			);
			await requestWorkflowSaveCurrent(client);

			const listPromise = waitWorkflowListSnapshot(
				client,
				(payload) =>
					!payload.workflows.some(
						(entry) => entry.workflowId === 'smoke',
					),
			);

			await requestWorkflowDelete(client, { workflowId: 'smoke' });

			const { workflows } = await listPromise;
			expect(
				workflows.some((entry) => entry.workflowId === 'smoke'),
			).toBe(false);
			expect(
				workflows.some((entry) => entry.workflowId === 'example'),
			).toBe(true);
		});

		it('leaves catalog unchanged when deleting unknown workflow id', async () => {
			const before = await requestWorkflowList(client);

			const after = await requestWorkflowDeleteSnapshot(client, {
				workflowId: 'missing-workflow',
			});

			expect(
				after.workflows.map((entry) => entry.workflowId).sort(),
			).toEqual(before.workflows.map((entry) => entry.workflowId).sort());
		});

		it('clears active workflow when the loaded workflow is deleted', async () => {
			await seedWorkflowFromDisk(
				client,
				projectDir,
				stringPreviewWorkflow('delete-active'),
			);

			const clearedPromise = waitWorkflowCurrentSnapshot(
				client,
				(payload) => payload.activeWorkflow === null,
			);

			client['workflow.delete.requested'].next({
				workflowId: 'smoke',
			});

			const cleared = await clearedPromise;
			expect(cleared.activeWorkflow).toBeNull();
			expect(cleared.currentStatus.status).toBe('pristine');
		});
	});

	describe('load', () => {
		it('loads example workflow into session', async () => {
			const loaded = await requestWorkflowLoad(client, {
				workflowId: 'example',
			});

			expect(loaded.workflowId).toBe('example');
			expect(
				loaded.graph.nodes.some(
					(node) => node.type === 'common-string',
				),
			).toBe(true);
		});

		it('keeps active workflow when loading unknown id', async () => {
			await requestWorkflowLoad(client, { workflowId: 'example' });

			const snapshot = await requestWorkflowLoadSnapshot(client, {
				workflowId: 'missing-workflow',
			});

			expect(snapshot.activeWorkflow?.workflowId).toBe('example');
		});

		it('loads workflow saved on disk without going through save intent', async () => {
			await writeWorkflowDocument(
				projectDir,
				stringPreviewWorkflow('from-disk'),
			);

			const loaded = await requestWorkflowLoad(client, {
				workflowId: 'smoke',
			});

			expect(loaded.graph.nodes[0]?.inputs.value).toBe('from-disk');
		});
	});

	describe('current workflow commands', () => {
		it('partial-saves rename identity while keeping dirty graph uncommitted', async () => {
			await requestWorkflowLoad(client, {
				workflowId: 'example',
			});

			const dirtyStatusPromise = firstValueFrom(
				client['workflow.currentStatus.snapshot'].pipe(
					filter((payload) => payload.status === 'dirty'),
					take(1),
				),
			);

			client['editor.updateNode.requested'].next({
				nodeId: 'string-1',
				inputs: { value: 'dirty-edit' },
			});

			await dirtyStatusPromise;

			const listPromise = waitWorkflowListSnapshot(client, (list) =>
				list.workflows.some(
					(entry) => entry.workflowId === 'renamed-example',
				),
			);

			const renamedPromise = waitWorkflowCurrentSnapshot(
				client,
				(payload) =>
					payload.activeWorkflow?.metadata.name ===
						'Renamed Example' &&
					payload.activeWorkflow?.workflowId === 'renamed-example' &&
					payload.currentStatus.status === 'dirty',
			);

			client['workflow.renameCurrent.requested'].next({
				name: 'Renamed Example',
			});

			const [renamed, list] = await Promise.all([
				renamedPromise,
				listPromise,
			]);

			expect(renamed.activeWorkflow?.graph.nodes[0]?.inputs.value).toBe(
				'dirty-edit',
			);
			expect(
				list.workflows.some((entry) => entry.workflowId === 'example'),
			).toBe(false);

			const onDisk = JSON.parse(
				await fs.readFile(
					path.join(
						projectDir,
						'.langflower',
						'workflows',
						'renamed-example.json',
					),
					'utf8',
				),
			) as {
				readonly metadata: { readonly name: string };
				readonly graph: {
					readonly nodes: readonly {
						readonly inputs?: { readonly value?: string };
					}[];
				};
			};

			expect(onDisk.metadata.name).toBe('Renamed Example');
			expect(onDisk.graph.nodes[0]?.inputs?.value).not.toBe('dirty-edit');

			const savedSnapshot = await requestWorkflowSaveCurrent(client);

			expect(savedSnapshot.currentStatus.status).toBe('pristine');
			expect(
				savedSnapshot.activeWorkflow?.graph.nodes[0]?.inputs.value,
			).toBe('dirty-edit');
		});

		it('creates an empty dirty workflow without writing disk', async () => {
			const snapshotPromise = waitWorkflowCurrentSnapshot(
				client,
				(payload) =>
					payload.activeWorkflow?.metadata.name === 'Untitled' &&
					payload.currentStatus.status === 'dirty',
			);

			client['workflow.create.requested'].next({});

			const snapshot = await snapshotPromise;
			const workflowId = snapshot.activeWorkflow?.workflowId;

			expect(workflowId).toBeTruthy();
			expect(snapshot.activeWorkflow?.graph.nodes).toEqual([]);

			await expect(
				fs.access(
					path.join(
						projectDir,
						'.langflower',
						'workflows',
						`${workflowId}.json`,
					),
				),
			).rejects.toThrow();
		});

		it('copies a workflow to {id}-copy.json and opens it', async () => {
			await requestWorkflowLoad(client, {
				workflowId: 'renamed-example',
			});

			const listPromise = waitWorkflowListSnapshot(client, (list) =>
				list.workflows.some(
					(entry) => entry.workflowId === 'renamed-example-copy',
				),
			);

			const currentPromise = waitWorkflowCurrentSnapshot(
				client,
				(payload) =>
					payload.activeWorkflow?.workflowId ===
						'renamed-example-copy' &&
					payload.currentStatus.status === 'pristine',
			);

			client['workflow.copy.requested'].next({
				workflowId: 'renamed-example',
			});

			const [current, list] = await Promise.all([
				currentPromise,
				listPromise,
			]);

			expect(current.activeWorkflow?.metadata.name).toBe(
				'Renamed Example copy',
			);
			expect(
				list.workflows.some(
					(entry) => entry.workflowId === 'renamed-example',
				),
			).toBe(true);

			await fs.access(
				path.join(
					projectDir,
					'.langflower',
					'workflows',
					'renamed-example-copy.json',
				),
			);
		});
	});
});
