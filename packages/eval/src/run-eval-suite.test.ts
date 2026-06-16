import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEvalPack, loadReplayMap } from './load-pack.js';
import { createReplayCaseRunner, runEvalSuite } from './run-eval-suite.js';

const FIXTURE_PACK = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../tests/fixtures/eval/golden-sample',
);

describe('runEvalSuite', () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-eval-'));
		await fs.cp(FIXTURE_PACK, projectRoot, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(projectRoot, { recursive: true, force: true });
	});

	it('loads the documented golden-sample pack', async () => {
		const pack = await loadEvalPack(projectRoot);
		expect(pack.id).toBe('golden-sample');
		expect(pack.threshold).toBe(1);
		expect(pack.cases).toHaveLength(2);
		expect(pack.skillPath).toBe('skills/triage.md');
	});

	it('passes when replay meets threshold and loads skill via read', async () => {
		const replay = await loadReplayMap(
			path.join(projectRoot, 'replay-pass.json'),
		);
		const result = await runEvalSuite({
			packDir: projectRoot,
			projectRoot,
			runCase: createReplayCaseRunner(replay),
		});
		expect(result.passed).toBe(true);
		expect(result.suiteScore).toBe(1);
		expect(result.skillMarkdown).toMatch(/triage/i);
		expect(result.failedCaseIds).toEqual([]);
	});

	it('fails closed (stop-on-regression) when score < threshold', async () => {
		const replay = await loadReplayMap(
			path.join(projectRoot, 'replay-fail.json'),
		);
		const result = await runEvalSuite({
			packDir: projectRoot,
			projectRoot,
			runCase: createReplayCaseRunner(replay),
		});
		expect(result.passed).toBe(false);
		expect(result.suiteScore).toBeLessThan(result.threshold);
		expect(result.failedCaseIds).toContain('greet');
	});
});
