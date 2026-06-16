import path from 'node:path';
import {
	createProjectHarness,
	type Harness,
} from '@langflower/tools/create-project-harness';
import type { PermissionConfig } from '@langflower/tools/permission';
import type { EvalCase, EvalPack, EvalScorerKind } from './eval-pack-types.js';
import { loadEvalPack } from './load-pack.js';
import { loadSkillViaRead } from './load-skill-via-read.js';
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
	readonly harness: Harness | null;
}) => Promise<string>;

export type RunEvalSuiteOptions = {
	readonly packDir: string;
	/** Project root for harness path fence + skill `read`. Defaults to packDir. */
	readonly projectRoot?: string;
	readonly runCase: EvalCaseRunner;
	/** Optional harness override (tests). */
	readonly harness?: Harness;
};

const allowReadPermission: PermissionConfig = {
	read: { '*': 'allow' },
	glob: { '*': 'allow' },
	grep: { '*': 'allow' },
	edit: { '*': 'deny' },
	write: { '*': 'deny' },
	create: { '*': 'deny' },
	delete: { '*': 'deny' },
	bash: { '*': 'deny' },
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
 * this package does not own agent implementations.
 */
export const runEvalSuite = async (
	options: RunEvalSuiteOptions,
): Promise<EvalSuiteResult> => {
	const packDir = path.resolve(options.packDir);
	const projectRoot = path.resolve(options.projectRoot ?? packDir);
	const pack = await loadEvalPack(packDir);

	const harness =
		options.harness ??
		(pack.skillPath === undefined
			? null
			: createProjectHarness({
					projectRoot,
					permission: allowReadPermission,
				}));

	const skillMarkdown =
		pack.skillPath === undefined || harness === null
			? null
			: await loadSkillViaRead(harness, pack.skillPath);

	const caseResults: EvalCaseResult[] = [];
	for (const evalCase of pack.cases) {
		const actual = await options.runCase({
			pack,
			case: evalCase,
			skillMarkdown,
			projectRoot,
			harness,
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
