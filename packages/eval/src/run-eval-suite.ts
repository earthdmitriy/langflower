import path from 'node:path';
import {
	createProjectHarness,
	type Harness,
} from '@langflower/tools/create-project-harness';
import {
	DEFAULT_PERMISSION_CONFIG,
	type PermissionConfig,
} from '@langflower/tools/permission';
import type { EvalCase, EvalPack, EvalScorerKind } from './eval-pack-types.js';
import { loadEvalPack } from './load-pack.js';
import { scoreCase } from './score-case.js';

export type EvalCaseResult = {
	readonly caseId: string;
	readonly score: number;
	readonly passed: boolean;
	readonly actual: string;
	readonly expected: string;
	readonly scorer: EvalScorerKind;
};

export type EvalSuiteResult = {
	readonly packId: string;
	readonly threshold: number;
	readonly suiteScore: number;
	readonly passed: boolean;
	readonly skillMarkdown: string | null;
	readonly cases: readonly EvalCaseResult[];
	readonly failedCaseIds: readonly string[];
};

export type EvalCaseRunner = (args: {
	readonly pack: EvalPack;
	readonly case: EvalCase;
	readonly skillMarkdown: string | null;
	readonly projectRoot: string;
}) => Promise<string>;

export type RunEvalSuiteOptions = {
	readonly packDir: string;
	/** Project root for harness path fence + skill `read`. Defaults to packDir. */
	readonly projectRoot?: string;
	readonly runCase: EvalCaseRunner;
};

const skillReadPermission: PermissionConfig = {
	...DEFAULT_PERMISSION_CONFIG,
	read: { '*': 'allow' },
	glob: { '*': 'deny' },
	grep: { '*': 'deny' },
	edit: { '*': 'deny' },
	write: { '*': 'deny' },
	create: { '*': 'deny' },
	delete: { '*': 'deny' },
	move: { '*': 'deny' },
	sleep: { '*': 'deny' },
	bash: { '*': 'deny' },
	ask_user: { '*': 'deny' },
};

const loadSkillViaRead = async (
	harness: Harness,
	skillPath: string,
): Promise<string> => {
	const result = await harness.invoke({
		toolId: 'read',
		args: { path: skillPath },
	});
	if (!result.ok) {
		throw new Error(
			`failed to read skill via harness read (${skillPath}): ${result.text}`,
		);
	}
	return result.text;
};

const meanScore = (scores: readonly number[]): number => {
	if (scores.length === 0) {
		return 0;
	}
	const sum = scores.reduce((acc, n) => acc + n, 0);
	return sum / scores.length;
};

/**
 * Batch fixture runner + threshold gate.
 *
 * Call order: load pack → (optional) skill via `read` → each case (`runCase`)
 * → score → aggregate → fail-closed when suiteScore < threshold.
 *
 * `runCase` is injected by the consumer (CLI Fake / `--replay` / real LLM) —
 * this package does not own agent implementations. The project harness is
 * local to skill `read` and is not passed to runners.
 */
export const runEvalSuite = async (
	options: RunEvalSuiteOptions,
): Promise<EvalSuiteResult> => {
	const packDir = path.resolve(options.packDir);
	const projectRoot = path.resolve(options.projectRoot ?? packDir);
	const pack = await loadEvalPack(packDir);

	const skillMarkdown =
		pack.skillPath === undefined
			? null
			: await loadSkillViaRead(
					createProjectHarness({
						projectRoot,
						permission: skillReadPermission,
					}),
					pack.skillPath,
				);

	const caseResults: EvalCaseResult[] = [];
	for (const evalCase of pack.cases) {
		const actual = await options.runCase({
			pack,
			case: evalCase,
			skillMarkdown,
			projectRoot,
		});
		const scorer = evalCase.scorer ?? pack.scorer;
		const score = scoreCase(actual, evalCase.expected, scorer);
		caseResults.push({
			caseId: evalCase.id,
			score,
			passed: score >= 1,
			actual,
			expected: evalCase.expected,
			scorer,
		});
	}

	const suiteScore = meanScore(caseResults.map((c) => c.score));
	const passed = suiteScore >= pack.threshold;
	const failedCaseIds = caseResults
		.filter((c) => !c.passed)
		.map((c) => c.caseId);

	return {
		packId: pack.id,
		threshold: pack.threshold,
		suiteScore,
		passed,
		skillMarkdown,
		cases: caseResults,
		failedCaseIds,
	};
};

/** Replay agent: look up scripted output by case id (offline / CI). */
export const createReplayCaseRunner = (
	replay: Readonly<Record<string, string>>,
): EvalCaseRunner => {
	return async ({ case: evalCase }) => {
		const actual = replay[evalCase.id];
		if (actual === undefined) {
			throw new Error(
				`replay map missing output for case "${evalCase.id}"`,
			);
		}
		return actual;
	};
};
