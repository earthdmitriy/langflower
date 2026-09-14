import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildTargetedTestArgv,
	isAllowedScript,
	NPM_SCRIPT_TOOLS,
	parsePathList,
	parseTargetedSuite,
	resolveUnderProject,
	runAllowlistedNpm,
	runAllowlistedNpmResult,
	runTargetedTests,
} from './run-npm-script.ts';

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
	execFile: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);
const mockExecFile = vi.mocked(execFile);

const emitSpawn = (exitCode: number, stdout = '', stderr = '') => {
	const child = new EventEmitter() as ReturnType<typeof spawn>;
	const out = new EventEmitter();
	const err = new EventEmitter();
	Object.assign(child, { stdout: out, stderr: err });
	queueMicrotask(() => {
		if (stdout.length > 0) {
			out.emit('data', stdout);
		}

		if (stderr.length > 0) {
			err.emit('data', stderr);
		}

		child.emit('close', exitCode);
	});
	return child;
};

describe('run-npm-script helpers', () => {
	it('maps the curated allowlist to npm_ tool ids', () => {
		expect(NPM_SCRIPT_TOOLS.map((tool) => tool.script)).toEqual([
			'build',
			'typecheck',
			'format',
			'format:check',
			'lint',
			'lint:fix',
			'test',
			'test:details',
			'test:unit',
			'test:integration',
			'verify',
			'verify:quick',
			'check:exports',
			'check:exports:fix',
			'check:dead-code',
			'check:dead-code:json',
			'clean-orphans',
		]);
		expect(isAllowedScript('test')).toBe(true);
		expect(isAllowedScript('start')).toBe(false);
		expect(isAllowedScript('clean')).toBe(false);
		expect(
			NPM_SCRIPT_TOOLS.find((tool) => tool.script === 'test')?.toolId,
		).toBe('npm_test');
	});

	it('builds targeted vitest argv with a suite flag and --', () => {
		expect(buildTargetedTestArgv('unit', ['a.test.ts'])).toEqual([
			'--unit',
			'--',
			'a.test.ts',
		]);
		expect(buildTargetedTestArgv('integration', ['tests/x.ts'])).toEqual([
			'--integration',
			'--',
			'tests/x.ts',
		]);
		expect(buildTargetedTestArgv('all', ['pkg'])).toEqual(['--', 'pkg']);
		expect(parseTargetedSuite('nope')).toBe('unit');
		expect(parsePathList(['  a.test.ts  ', ''])).toEqual(['a.test.ts']);
		expect(parsePathList(1)).toEqual([]);
	});

	it('rejects paths that escape projectDir', () => {
		expect(() => resolveUnderProject('/proj', '../outside')).toThrow(
			/escapes projectDir/,
		);
		expect(resolveUnderProject('/proj', 'src/a.test.ts')).toBe(
			path.resolve('/proj', 'src/a.test.ts'),
		);
	});
});

describe('runAllowlistedNpm', () => {
	afterEach(() => {
		mockSpawn.mockReset();
	});

	it('spawns allowlisted npm run and strips success to ok', async () => {
		mockSpawn.mockImplementation(() => emitSpawn(0, 'ok\n ✓ pass\n'));
		const result = await runAllowlistedNpmResult('test', '/proj');
		expect(result).toEqual({ ok: true, text: 'ok  npm_test' });
		expect(await runAllowlistedNpm('test', '/proj')).toBe('ok  npm_test');
		expect(mockSpawn).toHaveBeenCalledWith(
			'npm run test',
			expect.objectContaining({
				cwd: '/proj',
				shell: true,
			}),
		);
	});

	it('returns ok: false with stripped text on non-zero exit', async () => {
		mockSpawn.mockImplementation(() =>
			emitSpawn(1, '', 'packages/foo.ts(1,1): error TS2345: boom'),
		);
		const result = await runAllowlistedNpmResult('typecheck', '/proj');
		expect(result.ok).toBe(false);
		expect(result.text).toContain('failed  npm_typecheck');
		expect(result.text).toContain('TS2345');
	});

	it('throws when projectDir is empty', async () => {
		await expect(runAllowlistedNpm('test', '')).rejects.toThrow(
			/projectDir/,
		);
		expect(mockSpawn).not.toHaveBeenCalled();
	});
});

describe('runTargetedTests', () => {
	let root: string;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-dev-nodes-'));
		mockExecFile.mockReset();
	});

	afterEach(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	it('returns a one-line failure without spawn when paths are empty', async () => {
		const text = await runTargetedTests({}, root);
		expect(text).toBe('failed  run_targeted_tests  paths is required');
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it('returns a one-line failure without spawn when a path escapes', async () => {
		const text = await runTargetedTests(
			{ paths: ['../outside.test.ts'] },
			root,
		);
		expect(text).toMatch(/^failed  run_targeted_tests  Path escapes/);
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it('returns a one-line failure when test.mjs is missing', async () => {
		const text = await runTargetedTests({ paths: ['a.test.ts'] }, root);
		expect(text).toBe(
			'failed  run_targeted_tests  build/test.mjs not found',
		);
		expect(mockExecFile).not.toHaveBeenCalled();
	});

	it('execFile node build/test.mjs with suite flags and relative paths', async () => {
		await fs.mkdir(path.join(root, 'build'));
		await fs.writeFile(path.join(root, 'build', 'test.mjs'), '// stub\n');
		mockExecFile.mockImplementation(((
			_file: string,
			_args: readonly string[],
			_options: object,
			callback: (
				error: Error | null,
				stdout: string,
				stderr: string,
			) => void,
		) => {
			callback(null, 'ok\n', '');
			return {} as ReturnType<typeof execFile>;
		}) as typeof execFile);

		const text = await runTargetedTests(
			{
				paths: ['lib/run-npm-script.test.ts'],
				suite: 'unit',
			},
			root,
		);
		expect(text).toBe('ok  run_targeted_tests');
		expect(mockExecFile).toHaveBeenCalledTimes(1);
		const call = mockExecFile.mock.calls[0];
		expect(call?.[0]).toBe(process.execPath);
		expect(call?.[1]).toEqual([
			path.join(root, 'build', 'test.mjs'),
			'--unit',
			'--',
			'lib/run-npm-script.test.ts',
		]);
		expect(call?.[2]).toEqual(
			expect.objectContaining({
				cwd: root,
				windowsHide: true,
			}),
		);
	});
});
