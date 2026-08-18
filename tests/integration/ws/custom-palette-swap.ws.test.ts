import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CustomPaletteSnapshotPayload } from '@langflower/shared/langflower.js';
import {
	interruptRunner,
	requestWorkflowSaveCurrent,
	waitSessionReady,
	type LangflowerWsClient,
} from '@langflower/shared/langflower-ws-waits';
import { filter, firstValueFrom, take, timeout } from 'rxjs';
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
	edge,
	previewNode,
	savePayload,
	scenarioMetadata,
	stringNode,
	ui,
} from '../helpers/workflow-scenario-builders.js';
import {
	createLangflowerWsClient,
	runFullGraphAndWaitForOutput,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';

const echoSource = (options: {
	readonly out: string;
	readonly extra?: boolean;
}): string => {
	const extraOutput =
		options.extra === true ? `\n\t\textra: { wireType: 'string' },` : '';
	const extraResult = options.extra === true ? `, extra: 'extra-v1'` : '';

	return `import { defineNode } from '@langflower/node-sdk';

export default defineNode({
	type: 'fixture-custom-echo',
	displayName: 'Fixture Custom Echo',
	category: 'Text',
	uiSchema: [] as const,
	inputs: {
		trigger: { wireType: 'any', required: true, dynamic: true },
	},
	outputs: {
		out: { wireType: 'string' },${extraOutput}
	},
	execute() {
		return { out: '${options.out}'${extraResult} };
	},
});
`;
};

const writePack = async (projectDir: string, source: string): Promise<void> => {
	const packDir = path.join(projectDir, '.langflower', 'nodes', 'echo-pack');
	await fs.mkdir(packDir, { recursive: true });
	await fs.writeFile(
		path.join(packDir, 'package.json'),
		`${JSON.stringify(
			{
				name: 'echo-pack',
				version: '0.0.0',
				private: true,
				type: 'module',
			},
			null,
			'\t',
		)}\n`,
		'utf8',
	);
	await fs.writeFile(path.join(packDir, 'echo.ts'), source, 'utf8');
};

const waitCustomStatus = (
	client: LangflowerWsClient,
	status: CustomPaletteSnapshotPayload['status'],
): Promise<CustomPaletteSnapshotPayload> =>
	firstValueFrom(
		client['customPalette.snapshot'].pipe(
			filter((snapshot) => snapshot.status === status),
			take(1),
			timeout(15_000),
		),
	);

const customEchoNode = (id: string) => ({
	id,
	type: 'fixture-custom-echo',
	params: {},
	inputs: {},
	ui: ui(240, 0, 'Echo'),
});

describe('customPalette hot-swap (WS)', () => {
	let projectDir: string | undefined;
	let urls: TestServerHandle | undefined;
	let client: LangflowerWsClient | undefined;

	afterEach(async () => {
		client?.close();
		client = undefined;
		await stopTestServer(urls);
		urls = undefined;

		if (projectDir !== undefined) {
			await removeTempProject(projectDir);
			projectDir = undefined;
		}
	});

	it('runs new execute after Update without workflow.load', async () => {
		projectDir = await createTempProject();
		await writePack(projectDir, echoSource({ out: 'v1' }));
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		const okOnBoot = waitCustomStatus(client, 'ok');
		await waitSessionReady(client);
		await okOnBoot;

		const loaded = await seedWorkflowFromDisk(
			client,
			projectDir,
			savePayload(
				'swap-echo',
				scenarioMetadata('Swap Echo'),
				[
					stringNode('string-1', 'go', { x: 0, y: 0 }),
					customEchoNode('custom-1'),
					previewNode('preview-1', { x: 480, y: 0 }),
				],
				[
					edge(
						'e-trigger',
						'string-1',
						'value',
						'custom-1',
						'trigger',
					),
					edge('e-out', 'custom-1', 'out', 'preview-1', 'text'),
				],
			),
		);

		expect(loaded.graph.edges.map((item) => item.edgeId).sort()).toEqual([
			'e-out',
			'e-trigger',
		]);

		const first = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'custom-1',
			portId: 'out',
			predicate: (value) => value === 'v1',
		});
		expect(first.output[3].value).toBe('v1');
		await interruptRunner(client);

		const snapshots: unknown[] = [];
		const deletedBatches: unknown[] = [];
		const snapshotSub = client['workflow.current.snapshot'].subscribe(
			(snapshot) => {
				snapshots.push(snapshot);
			},
		);
		const deletedSub = client['editor.deleteEdges'].subscribe((edges) => {
			deletedBatches.push(edges);
		});

		await writePack(projectDir, echoSource({ out: 'v2' }));
		const okPromise = waitCustomStatus(client, 'ok');
		client['customPalette.update.requested'].next({});
		await okPromise;
		snapshotSub.unsubscribe();
		deletedSub.unsubscribe();

		expect(snapshots).toEqual([]);
		expect(deletedBatches).toEqual([]);

		const second = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'custom-1',
			portId: 'out',
			predicate: (value) => value === 'v2',
		});
		expect(second.output[3].value).toBe('v2');
		await interruptRunner(client);
	}, 90_000);

	it('emits editor.deleteEdges when a swapped port vanishes', async () => {
		projectDir = await createTempProject();
		await writePack(projectDir, echoSource({ out: 'v1', extra: true }));
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		const okOnBoot = waitCustomStatus(client, 'ok');
		await waitSessionReady(client);
		await okOnBoot;

		await seedWorkflowFromDisk(
			client,
			projectDir,
			savePayload(
				'swap-shape',
				scenarioMetadata('Swap Shape'),
				[
					stringNode('string-1', 'go', { x: 0, y: 0 }),
					customEchoNode('custom-1'),
					previewNode('preview-1', { x: 480, y: 0 }),
				],
				[
					edge(
						'e-trigger',
						'string-1',
						'value',
						'custom-1',
						'trigger',
					),
					edge('e-extra', 'custom-1', 'extra', 'preview-1', 'text'),
				],
			),
		);

		const snapshots: unknown[] = [];
		const snapshotSub = client['workflow.current.snapshot'].subscribe(
			(snapshot) => {
				snapshots.push(snapshot);
			},
		);
		const deletedPromise = firstValueFrom(
			client['editor.deleteEdges'].pipe(take(1), timeout(15_000)),
		);
		const statusPromise = firstValueFrom(
			client['workflow.currentStatus.snapshot'].pipe(
				filter((payload) => payload.status === 'dirty'),
				take(1),
				timeout(15_000),
			),
		);

		await writePack(projectDir, echoSource({ out: 'v2' }));
		const okPromise = waitCustomStatus(client, 'ok');
		client['customPalette.update.requested'].next({});
		const deleted = await deletedPromise;
		await okPromise;
		snapshotSub.unsubscribe();

		expect(snapshots).toEqual([]);
		expect(deleted.some((edgeItem) => edgeItem.edgeId === 'e-extra')).toBe(
			true,
		);
		await expect(statusPromise).resolves.toEqual({ status: 'dirty' });

		const saved = await requestWorkflowSaveCurrent(client);
		const remainingIds =
			saved.activeWorkflow?.graph.edges.map((item) => item.edgeId) ?? [];
		expect(remainingIds).toContain('e-trigger');
		expect(remainingIds).not.toContain('e-extra');
	}, 90_000);
});
