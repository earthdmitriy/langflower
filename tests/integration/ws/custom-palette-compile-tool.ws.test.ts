import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeRunnerEvent } from '@langflower/runtime';
import type { CustomPaletteSnapshotPayload } from '@langflower/shared/langflower.js';
import {
	interruptRunner,
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
	fakeLlmNode,
	previewNode,
	savePayload,
	scenarioMetadata,
	stringNode,
	ui,
} from '../helpers/workflow-scenario-builders.js';
import {
	createLangflowerWsClient,
	runFromNodeAndWaitForOutput,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';

const echoSource = (
	out: string,
): string => `import { defineNode } from '@langflower/node-sdk';

export default defineNode({
	type: 'fixture-custom-echo',
	displayName: 'Fixture Custom Echo',
	category: 'Text',
	uiSchema: [] as const,
	inputs: {
		trigger: { wireType: 'any', required: true, dynamic: true },
	},
	outputs: {
		out: { wireType: 'string' },
	},
	execute() {
		return { out: '${out}' };
	},
});
`;

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

const toolsSource = (version: string): string =>
	`import { defineToolRegistrations } from '@langflower/node-sdk';

export default defineToolRegistrations({
	type: 'fixture-custom-echo-tools',
	displayName: 'Fixture Custom Echo Tools',
	category: 'Tools',
	tools: [
		{
			toolId: 'fixture_echo_tool',
			description: 'Returns a version tag.',
			inputSchema: {
				type: 'object',
				properties: {},
				additionalProperties: false,
			},
			handler: async () => '${version}',
		},
	],
});
`;

const writeToolsPack = async (
	projectDir: string,
	source: string,
): Promise<void> => {
	const packDir = path.join(
		projectDir,
		'.langflower',
		'nodes',
		'echo-tools-pack',
	);
	await fs.mkdir(packDir, { recursive: true });
	await fs.writeFile(
		path.join(packDir, 'package.json'),
		`${JSON.stringify(
			{
				name: 'echo-tools-pack',
				version: '0.0.0',
				private: true,
				type: 'module',
			},
			null,
			'\t',
		)}\n`,
		'utf8',
	);
	await fs.writeFile(path.join(packDir, 'echo-tools.ts'), source, 'utf8');
};

const waitCustomStatus = (
	client: LangflowerWsClient,
	status: CustomPaletteSnapshotPayload['status'],
): Promise<CustomPaletteSnapshotPayload> =>
	firstValueFrom(
		client['customPalette.snapshot'].pipe(
			filter((snapshot) => snapshot.status === status),
			take(1),
			timeout(60_000),
		),
	);

const customEchoNode = (id: string) => ({
	id,
	type: 'fixture-custom-echo',
	params: {},
	inputs: {},
	ui: ui(240, 0, 'Echo'),
});

const compileCustomNodesPersisted = (id: string) => ({
	id,
	type: 'common-langflower-tools',
	params: {},
	inputs: {},
	ui: ui(0, 240, 'Compile'),
});

describe('compile_custom_nodes (WS)', () => {
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

	it('compiles via Fake-LLM then next Run sees new execute without workflow.load', async () => {
		projectDir = await createTempProject();
		await writePack(projectDir, echoSource('v1'));
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		const okOnBoot = waitCustomStatus(client, 'ok');
		await waitSessionReady(client);
		await okOnBoot;

		await seedWorkflowFromDisk(
			client,
			projectDir,
			savePayload(
				'compile-tool-echo',
				scenarioMetadata('Compile Tool Echo'),
				[
					stringNode('string-1', 'go', { x: 0, y: 0 }),
					customEchoNode('custom-1'),
					previewNode('preview-1', { x: 480, y: 0 }),
					compileCustomNodesPersisted('compile-1'),
					fakeLlmNode(
						'llm-1',
						{ x: 280, y: 240 },
						{
							tokenDelayMs: 0,
							scriptedToolTurns: [
								{
									toolCalls: [
										{
											name: 'compile_custom_nodes',
											arguments: {},
										},
									],
								},
								{ text: 'compiled' },
							],
						},
					),
					stringNode(
						'prompt-1',
						'compile packs',
						{ x: 0, y: 240 },
						'Prompt',
					),
					previewNode('preview-llm', { x: 560, y: 240 }),
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
					edge('e-tools', 'compile-1', 'tools', 'llm-1', 'tools'),
					edge(
						'e-prompt',
						'prompt-1',
						'value',
						'llm-1',
						'userPrompt',
					),
					edge(
						'e-llm-out',
						'llm-1',
						'response',
						'preview-llm',
						'text',
					),
				],
			),
		);

		const first = await runFromNodeAndWaitForOutput(client, 'custom-1', {
			nodeId: 'custom-1',
			portId: 'out',
			predicate: (value) => value === 'v1',
		});
		expect(first.output[4]).toBe('v1');
		await interruptRunner(client);

		await writePack(projectDir, echoSource('v2'));
		const okPromise = waitCustomStatus(client, 'ok');
		const compiled = await runFromNodeAndWaitForOutput(client, 'llm-1', {
			nodeId: 'llm-1',
			portId: 'response',
			predicate: (value) =>
				typeof value === 'string' && value.includes('compiled'),
		});
		const snapshot = await okPromise;
		expect(compiled.output[4]).toContain('compiled');
		expect(snapshot.status).toBe('ok');
		expect(
			snapshot.nodes.some((node) => node.type === 'fixture-custom-echo'),
		).toBe(true);
		await interruptRunner(client);

		const second = await runFromNodeAndWaitForOutput(client, 'custom-1', {
			nodeId: 'custom-1',
			portId: 'out',
			predicate: (value) => value === 'v2',
		});
		expect(second.output[4]).toBe('v2');
		await interruptRunner(client);
	}, 90_000);

	it('invokes swapped custom toolId in the same run after compile', async () => {
		projectDir = await createTempProject();
		await writeToolsPack(projectDir, toolsSource('v1'));
		urls = await startTestServer({ projectDir });
		client = createLangflowerWsClient(urls.wsUrl);
		const okOnBoot = waitCustomStatus(client, 'ok');
		await waitSessionReady(client);
		await okOnBoot;

		await seedWorkflowFromDisk(
			client,
			projectDir,
			savePayload(
				'compile-tool-same-run',
				scenarioMetadata('Compile Tool Same Run'),
				[
					compileCustomNodesPersisted('compile-1'),
					{
						id: 'custom-tools-1',
						type: 'fixture-custom-echo-tools',
						params: {},
						inputs: {},
						ui: ui(0, 0, 'Echo Tools'),
					},
					fakeLlmNode(
						'llm-1',
						{ x: 280, y: 0 },
						{
							tokenDelayMs: 0,
							maxIterations: 8,
							scriptedToolTurns: [
								{
									toolCalls: [
										{
											name: 'compile_custom_nodes',
											arguments: {},
										},
									],
								},
								{
									toolCalls: [
										{
											name: 'fixture_echo_tool',
											arguments: {},
										},
									],
								},
								{ text: 'done-v2' },
							],
						},
					),
					stringNode(
						'prompt-1',
						'compile then echo',
						{ x: 0, y: 240 },
						'Prompt',
					),
					previewNode('preview-llm', { x: 560, y: 0 }),
				],
				[
					edge('e-compile', 'compile-1', 'tools', 'llm-1', 'tools'),
					// Distinct combine slot: addEdge rejects a second
					// occupant of tools@0, so the custom pack never wired.
					edge(
						'e-custom',
						'custom-tools-1',
						'tools',
						'llm-1',
						'tools@1',
					),
					edge(
						'e-prompt',
						'prompt-1',
						'value',
						'llm-1',
						'userPrompt',
					),
					edge(
						'e-llm-out',
						'llm-1',
						'response',
						'preview-llm',
						'text',
					),
				],
			),
		);

		await writeToolsPack(projectDir, toolsSource('v2'));

		const snapshots: unknown[] = [];
		const snapshotSub = client['workflow.current.snapshot'].subscribe(
			(snapshot) => {
				snapshots.push(snapshot);
			},
		);
		const toolLogs: string[] = [];
		const toolSub = client['runner.port'].subscribe(
			(event: RuntimeRunnerEvent) => {
				if (
					event[0] === 'out' &&
					event[3] === 'value' &&
					event[2] === 'toolLog'
				) {
					toolLogs.push(String(event[4]));
				}
			},
		);

		const compiled = await runFromNodeAndWaitForOutput(client, 'llm-1', {
			nodeId: 'llm-1',
			portId: 'response',
			predicate: (value) =>
				typeof value === 'string' && value.includes('done-v2'),
		});
		snapshotSub.unsubscribe();
		toolSub.unsubscribe();

		expect(compiled.output[4]).toContain('done-v2');
		expect(snapshots).toEqual([]);
		expect(toolLogs.join('\n')).toContain('← compile_custom_nodes:');
		expect(toolLogs.join('\n')).toContain('status: ok');
		expect(toolLogs.join('\n')).toContain('← fixture_echo_tool: v2');
		expect(
			toolLogs.filter((line) => line.includes('→ compile_custom_nodes')),
		).toHaveLength(1);
		await interruptRunner(client);
	}, 90_000);
});
