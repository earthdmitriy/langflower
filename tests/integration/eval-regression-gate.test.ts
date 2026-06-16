import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRepoRoot } from './helpers/repo-paths.js';

const repoRoot = getRepoRoot();
const packDir = path.join(repoRoot, 'tests/fixtures/eval/golden-sample');
const cliBin = path.join(repoRoot, 'packages/cli/bin/langflower.js');

const runEvalCli = (args: readonly string[]) =>
	spawnSync(process.execPath, [cliBin, 'eval', packDir, ...args], {
		encoding: 'utf8',
		cwd: repoRoot,
	});

describe('eval regression gate (CLI)', () => {
	it('primary path runs Fake agent under test without --replay', () => {
		const result = runEvalCli(['--project', packDir]);
		expect(result.status, result.stderr || result.stdout).toBe(0);
		expect(result.stdout).toMatch(/Fake skill-token agent/);
		expect(result.stdout).toMatch(/Gate passed/);
	});

	it('documented pack passes when replay score meets threshold', () => {
		const result = runEvalCli([
			'--project',
			packDir,
			'--replay',
			path.join(packDir, 'replay-pass.json'),
		]);
		expect(result.status, result.stderr || result.stdout).toBe(0);
		expect(result.stdout).toMatch(/Gate passed/);
	});

	it('documented pack fails the job when replay score < threshold', () => {
		const result = runEvalCli([
			'--project',
			packDir,
			'--replay',
			path.join(packDir, 'replay-fail.json'),
		]);
		expect(result.status, result.stdout || result.stderr).toBe(1);
		expect(`${result.stdout}\n${result.stderr}`).toMatch(
			/Gate failed \(regression\)/,
		);
	});
});
