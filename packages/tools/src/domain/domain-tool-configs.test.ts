import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectHarness } from '../create-project-harness.js';
import {
	MEMORY_TOOL_CONFIGS,
	type ToolHandlerContext,
} from './domain-tool-configs.js';

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe('domain tool configs', () => {
	it('memory handlers work via imported config + ctx (not harness registry)', async () => {
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-domain-'),
		);
		tempDirs.push(projectDir);

		const ctx: ToolHandlerContext = {
			projectDir,
			runId: 'run-d',
		};

		const create = MEMORY_TOOL_CONFIGS.find(
			(t) => t.toolId === 'create_memory_file',
		);
		const append = MEMORY_TOOL_CONFIGS.find(
			(t) => t.toolId === 'append_memory_log',
		);
		const tree = MEMORY_TOOL_CONFIGS.find(
			(t) => t.toolId === 'get_memory_tree',
		);
		expect(create).toBeDefined();
		expect(append).toBeDefined();
		expect(tree).toBeDefined();

		await create!.handler(
			{ file_path: 'notes.md', initial_content: '# Notes\n' },
			ctx,
		);
		await append!.handler(
			{ file_path: 'notes.md', content: '- entry v1' },
			ctx,
		);
		const text = await tree!.handler({}, ctx);
		expect(text).toContain('notes.md');

		const harness = createProjectHarness({ projectRoot: projectDir });
		const viaHarness = await harness.invoke({
			toolId: 'get_memory_tree',
			args: {},
		});
		expect(viaHarness.ok).toBe(false);
		expect(
			harness.listBuiltinRegistrations().map((r) => r.toolId),
		).not.toContain('get_memory_tree');
	});
});
