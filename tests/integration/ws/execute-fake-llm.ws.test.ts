import type { RuntimeRunnerEvent } from '@langflower/runtime';
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
	fakeLlmStreamWorkflow,
	fakeLlmToolsWorkflow,
} from '../helpers/scenarios/fake-llm.js';
import {
	createLangflowerWsClient,
	runFullGraphAndWaitForOutput,
	seedWorkflowFromDisk,
} from './langflower-ws-client.js';
import {
	interruptRunner,
	type LangflowerWsClient,
	waitSessionReady,
} from '@langflower/shared/langflower-ws-waits';

describe('execute fake-llm (WS bridge)', () => {
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

	it('streams reasoning then draftResponse then response', async () => {
		await seedWorkflowFromDisk(client, projectDir, fakeLlmStreamWorkflow());

		const chunks: Array<{ portId: string; value: unknown }> = [];
		const sub = client['runner.port'].subscribe(
			(event: RuntimeRunnerEvent) => {
				if (
					event[0] === 'out' &&
					event[3] === 'value' &&
					event[1] === 'llm-1'
				) {
					chunks.push({ portId: event[2], value: event[4] });
				}
			},
		);

		const { output } = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'preview-1',
			portId: 'text',
			predicate: (value) =>
				typeof value === 'string' &&
				value.startsWith('Final:') &&
				value.includes('Write a haiku'),
		});

		sub.unsubscribe();

		expect(output[4]).toMatch(/^Final:/);
		expect(String(output[4])).toContain('Write a haiku');

		const ports = chunks.map((chunk) => chunk.portId);
		const firstDraft = ports.indexOf('draftResponse');
		const firstResponse = ports.indexOf('response');

		expect(firstDraft).toBeGreaterThan(0);
		expect(firstResponse).toBeGreaterThan(firstDraft);
		expect(ports.slice(0, firstDraft).every((p) => p === 'reasoning')).toBe(
			true,
		);
		expect(
			ports
				.slice(firstDraft, firstResponse)
				.every((p) => p === 'draftResponse'),
		).toBe(true);
		expect(ports.filter((p) => p === 'response')).toEqual(['response']);

		const reasoningText = chunks
			.filter((chunk) => chunk.portId === 'reasoning')
			.map((chunk) => String(chunk.value))
			.join('');
		expect(reasoningText).toContain('Write a haiku');

		await interruptRunner(client);
	});

	it('lists wired tools in reasoning', async () => {
		await seedWorkflowFromDisk(client, projectDir, fakeLlmToolsWorkflow());

		const reasoning: string[] = [];
		const sub = client['runner.port'].subscribe(
			(event: RuntimeRunnerEvent) => {
				if (
					event[0] === 'out' &&
					event[3] === 'value' &&
					event[1] === 'llm-1' &&
					event[2] === 'reasoning'
				) {
					reasoning.push(String(event[4]));
				}
			},
		);

		const { output } = await runFullGraphAndWaitForOutput(client, {
			nodeId: 'preview-1',
			portId: 'text',
			predicate: (value) =>
				typeof value === 'string' &&
				value.startsWith('Final:') &&
				value.includes('Search the repo'),
		});

		sub.unsubscribe();

		expect(output[4]).toMatch(/^Final:/);
		expect(String(output[4])).toContain('Search the repo');

		const reasoningText = reasoning.join('');
		expect(reasoningText).toContain('get_memory_tree');
		expect(reasoningText).toContain('append_memory_log');

		await interruptRunner(client);
	});
});
