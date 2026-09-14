import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolHandle } from '@langflower/node-sdk';
import { createNodeHarness } from '@langflower/node-sdk/testing';
import { NPM_SCRIPT_TOOLS } from './lib/run-npm-script.ts';
import lfDevTools from './lf-dev-tools.ts';

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
	execFile: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

const emitSpawn = (exitCode: number, stdout = '') => {
	const child = new EventEmitter() as ReturnType<typeof spawn>;
	const out = new EventEmitter();
	const err = new EventEmitter();
	Object.assign(child, { stdout: out, stderr: err });
	queueMicrotask(() => {
		if (stdout.length > 0) {
			out.emit('data', stdout);
		}

		child.emit('close', exitCode);
	});
	return child;
};

describe('lf-dev-tools', () => {
	afterEach(() => {
		mockSpawn.mockReset();
	});

	it('emits the curated toolIds plus run_targeted_tests', async () => {
		const harness = createNodeHarness(lfDevTools, {
			projectDir: '/proj',
		});
		const tools = await harness.next<readonly ToolHandle[]>('tools');
		expect(tools.map((tool) => tool.toolId)).toEqual([
			...NPM_SCRIPT_TOOLS.map((tool) => tool.toolId),
			'run_targeted_tests',
		]);
		harness.dispose();
	});

	it('invokes npm_typecheck through mocked spawn', async () => {
		mockSpawn.mockImplementation(() => emitSpawn(0, 'ok\n'));
		const harness = createNodeHarness(lfDevTools, {
			projectDir: '/proj',
		});
		const tools = await harness.next<readonly ToolHandle[]>('tools');
		const typecheck = tools.find((tool) => tool.toolId === 'npm_typecheck');
		expect(typecheck).toBeDefined();
		const text = await typecheck!.invoke(
			{},
			{ projectDir: '/proj', runId: 'r' },
		);
		expect(text).toBe('ok  npm_typecheck');
		expect(mockSpawn).toHaveBeenCalledWith(
			'npm run typecheck',
			expect.objectContaining({ cwd: '/proj', shell: true }),
		);
		harness.dispose();
	});
});
