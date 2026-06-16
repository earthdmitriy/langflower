import path from 'node:path';
import type { Command } from 'commander';
import { loadReplayMap } from '@langflower/eval/load-pack';
import {
	createReplayCaseRunner,
	runEvalSuite,
	type EvalCaseRunner,
	type EvalSuiteResult,
} from '@langflower/eval/run-eval-suite';
import { createFakeSkillCaseRunner } from './create-fake-skill-case-runner.js';

type EvalCommandOptions = {
	readonly project?: string;
	readonly replay?: string;
};

const printSuiteSummary = (result: EvalSuiteResult): void => {
	console.log(`Pack: ${result.packId}`);
	console.log(
		`Suite score: ${result.suiteScore.toFixed(3)} (threshold ${result.threshold})`,
	);
	for (const row of result.cases) {
		const mark = row.passed ? 'PASS' : 'FAIL';
		console.log(`  [${mark}] ${row.caseId} score=${row.score}`);
	}
	if (result.passed) {
		console.log('Gate passed.');
		return;
	}
	console.error(
		`Gate failed (regression). Failed cases: ${result.failedCaseIds.join(', ') || '(none — aggregate below threshold)'}`,
	);
};

/**
 * Compose the agent-under-test outside `@langflower/eval`.
 *
 * Call order: optional --replay map → else Fake skill-token runner.
 * Real LLM agents are composed by callers of `runEvalSuite({ runCase })`.
 */
const resolveCaseRunner = async (
	opts: EvalCommandOptions,
): Promise<{ readonly label: string; readonly runCase: EvalCaseRunner }> => {
	if (opts.replay !== undefined) {
		const replay = await loadReplayMap(path.resolve(opts.replay));
		return {
			label: 'replay map',
			runCase: createReplayCaseRunner(replay),
		};
	}
	return {
		label: 'Fake skill-token agent',
		runCase: createFakeSkillCaseRunner(),
	};
};

export const registerEvalCommand = (program: Command): void => {
	program
		.command('eval')
		.description(
			'Run a golden / fixture eval pack and fail closed when score < threshold',
		)
		.argument('<pack-dir>', 'Directory containing pack.json')
		.option(
			'--project <dir>',
			'Project root for harness path fence (default: pack-dir)',
		)
		.option(
			'--replay <file>',
			'JSON map of caseId → agent output (optional offline / CI agent)',
		)
		.action(async (packDirArg: string, opts: EvalCommandOptions) => {
			try {
				const packDir = path.resolve(packDirArg);
				const projectRoot = path.resolve(opts.project ?? packDir);
				const { label, runCase } = await resolveCaseRunner(opts);
				console.log(`Agent under test: ${label}`);
				const result = await runEvalSuite({
					packDir,
					projectRoot,
					runCase,
				});
				printSuiteSummary(result);
				if (!result.passed) {
					process.exitCode = 1;
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				console.error(`langflower eval failed: ${message}`);
				process.exitCode = 1;
			}
		});
};
