import fs from 'node:fs/promises';
import path from 'node:path';
import type { EvalCase, EvalPack, EvalScorerKind } from './eval-pack-types.js';

const isScorerKind = (value: unknown): value is EvalScorerKind =>
	value === 'exact' || value === 'includes';

const parseCase = (raw: unknown, index: number): EvalCase => {
	if (raw === null || typeof raw !== 'object') {
		throw new Error(`eval pack case[${index}] must be an object`);
	}
	const row = raw as Record<string, unknown>;
	const id = typeof row.id === 'string' ? row.id.trim() : '';
	const input = typeof row.input === 'string' ? row.input : '';
	const expected =
		typeof row.expected === 'string' ? row.expected.trim() : '';
	if (id.length === 0) {
		throw new Error(`eval pack case[${index}] needs a non-empty id`);
	}
	if (expected.length === 0) {
		throw new Error(`eval pack case "${id}" needs a non-empty expected`);
	}
	const scorer = row.scorer;
	if (scorer !== undefined && !isScorerKind(scorer)) {
		throw new Error(
			`eval pack case "${id}" scorer must be "exact" or "includes"`,
		);
	}
	return scorer === undefined
		? { id, input, expected }
		: { id, input, expected, scorer };
};

const parsePack = (raw: unknown): EvalPack => {
	if (raw === null || typeof raw !== 'object') {
		throw new Error('eval pack.json must be an object');
	}
	const doc = raw as Record<string, unknown>;
	const id = typeof doc.id === 'string' ? doc.id.trim() : '';
	if (id.length === 0) {
		throw new Error('eval pack.json needs a non-empty id');
	}
	const threshold =
		typeof doc.threshold === 'number' && Number.isFinite(doc.threshold)
			? doc.threshold
			: NaN;
	if (!(threshold >= 0 && threshold <= 1)) {
		throw new Error(
			`eval pack "${id}" threshold must be a number in [0, 1]`,
		);
	}
	const scorer = doc.scorer;
	if (!isScorerKind(scorer)) {
		throw new Error(
			`eval pack "${id}" scorer must be "exact" or "includes"`,
		);
	}
	if (!Array.isArray(doc.cases) || doc.cases.length === 0) {
		throw new Error(`eval pack "${id}" needs a non-empty cases array`);
	}
	const cases = doc.cases.map((c, i) => parseCase(c, i));
	const caseIds = cases.map((c) => c.id);
	const duplicateId = caseIds.find(
		(caseId, i) => caseIds.indexOf(caseId) !== i,
	);
	if (duplicateId !== undefined) {
		throw new Error(
			`eval pack "${id}" has duplicate case id "${duplicateId}"`,
		);
	}
	const skillPath =
		typeof doc.skillPath === 'string' && doc.skillPath.trim().length > 0
			? doc.skillPath.trim()
			: undefined;
	return skillPath === undefined
		? { id, threshold, scorer, cases }
		: { id, threshold, scorer, skillPath, cases };
};

/** Load and validate `<packDir>/pack.json`. */
export const loadEvalPack = async (packDir: string): Promise<EvalPack> => {
	const packPath = path.join(packDir, 'pack.json');
	const text = await fs.readFile(packPath, 'utf8');
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		throw new Error(`invalid JSON in ${packPath}`);
	}
	return parsePack(parsed);
};

/** Load a caseId → actual-output map used by offline / CI replay agents. */
export const loadReplayMap = async (
	replayPath: string,
): Promise<Readonly<Record<string, string>>> => {
	const text = await fs.readFile(replayPath, 'utf8');
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		throw new Error(`invalid JSON in ${replayPath}`);
	}
	if (
		parsed === null ||
		typeof parsed !== 'object' ||
		Array.isArray(parsed)
	) {
		throw new Error(`replay map must be a JSON object: ${replayPath}`);
	}
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(
		parsed as Record<string, unknown>,
	)) {
		if (typeof value !== 'string') {
			throw new Error(
				`replay map entry "${key}" must be a string (${replayPath})`,
			);
		}
		out[key] = value;
	}
	return out;
};
