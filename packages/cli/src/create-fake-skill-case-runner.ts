import type { EvalCaseRunner } from '@langflower/eval/run-eval-suite';

type SkillTokenRule = {
	readonly context: string;
	readonly token: string;
};

const LINE_TOKEN_RULE = /^(.*)answer\s+exactly:\s*`([^`]+)`/i;

const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'answer',
	'asked',
	'do',
	'exactly',
	'for',
	'from',
	'not',
	'of',
	'or',
	'say',
	'the',
	'to',
	'token',
	'when',
]);

const tokenize = (text: string): readonly string[] =>
	text
		.toLowerCase()
		.split(/[^a-z0-9_]+/)
		.filter((part) => part.length > 0 && !STOP_WORDS.has(part));

const parseSkillTokenRules = (
	skillMarkdown: string,
): readonly SkillTokenRule[] =>
	skillMarkdown.split(/\r?\n/).flatMap((line) => {
		const match = line.match(LINE_TOKEN_RULE);
		if (match === null) {
			return [];
		}
		const context = match[1]?.trim() ?? '';
		const token = match[2]?.trim() ?? '';
		if (token.length === 0) {
			return [];
		}
		return [{ context, token }];
	});

const scoreOverlap = (
	inputTokens: readonly string[],
	contextTokens: readonly string[],
): number => {
	if (contextTokens.length === 0) {
		return 0;
	}
	const inputSet = new Set(inputTokens);
	return contextTokens.filter((token) => inputSet.has(token)).length;
};

/**
 * Fake agent-under-test for CLI eval when `--replay` is omitted.
 *
 * Reads skill markdown for per-line `answer exactly: \`TOKEN\`` rules and
 * picks the token whose line context best overlaps the case input. No LLM —
 * composed in the CLI, not inside `@langflower/eval`.
 */
export const createFakeSkillCaseRunner = (): EvalCaseRunner => {
	return async ({ case: evalCase, skillMarkdown }) => {
		if (skillMarkdown === null || skillMarkdown.trim().length === 0) {
			throw new Error(
				'Fake skill agent requires pack skillPath markdown; use --replay for packs without a skill',
			);
		}
		const rules = parseSkillTokenRules(skillMarkdown);
		if (rules.length === 0) {
			throw new Error(
				'Fake skill agent found no "answer exactly: `TOKEN`" rules in skill markdown',
			);
		}
		const inputTokens = tokenize(evalCase.input);
		const ranked = rules
			.map((rule) => ({
				rule,
				score: scoreOverlap(inputTokens, tokenize(rule.context)),
			}))
			.sort((a, b) => b.score - a.score);
		const best = ranked[0];
		if (best === undefined || best.score <= 0) {
			throw new Error(
				`Fake skill agent could not match case "${evalCase.id}" input to a skill token rule`,
			);
		}
		return best.rule.token;
	};
};
