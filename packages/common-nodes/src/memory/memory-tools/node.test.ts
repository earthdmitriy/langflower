import { createNodeHarness } from '@langflower/node-sdk/testing';
import type { ToolHandle } from '@langflower/node-sdk';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryToolsNode } from './node.js';

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

const MEMORY_TOOL_IDS = [
	'append_memory_log',
	'create_memory_file',
	'get_memory_tree',
	'read_memory_section',
	'read_plan',
	'search_memory_grep',
	'update_memory_section',
	'update_plan',
] as const;

describe('common-memory-tools', () => {
	it('emits the full memory tool pack and a result plan port', async () => {
		const harness = createNodeHarness(memoryToolsNode);
		const tools = await harness.next<readonly ToolHandle[]>('tools');

		expect(tools.map((tool) => tool.toolId).sort()).toEqual(
			[...MEMORY_TOOL_IDS].sort(),
		);

		const planMeta = memoryToolsNode.outputsConfigs.find(
			(meta) => String(meta.portId) === 'plan',
		);
		expect(planMeta?.feed).toEqual({ role: 'result' });
		expect(planMeta?.wireType).toBe('string');

		harness.dispose();
	});

	it('emits the current plan after update_plan and not after read_plan', async () => {
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-memory-plan-'),
		);
		tempDirs.push(projectDir);

		const harness = createNodeHarness(memoryToolsNode, {
			projectDir,
			runId: 'run-plan',
		});
		const collected = harness.collect<string>('plan');
		const tools = await harness.next<readonly ToolHandle[]>('tools');
		const ctx = { projectDir, runId: 'run-plan' };

		const read = tools.find((tool) => tool.toolId === 'read_plan');
		const update = tools.find((tool) => tool.toolId === 'update_plan');
		expect(read).toBeDefined();
		expect(update).toBeDefined();

		await read!.invoke({}, ctx);
		expect(collected.values).toEqual([]);

		await update!.invoke({ content: '- Step 1\n- Step 2' }, ctx);
		expect(collected.values.at(-1)).toContain('## Plan');
		expect(collected.values.at(-1)).toContain('- Step 1');

		await expect(update!.invoke({ content: '   ' }, ctx)).rejects.toThrow(
			/Missing required string argument/,
		);
		expect(collected.values).toHaveLength(1);

		collected.stop();
		harness.dispose();
	});
});
