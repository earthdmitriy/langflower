import type { EvalScorerKind } from './eval-pack-types.js';

export const scoreCase = (
	actual: string,
	expected: string,
	scorer: EvalScorerKind,
): number => {
	const a = actual.trim();
	const e = expected.trim();
	switch (scorer) {
		case 'exact':
			return a === e ? 1 : 0;
		case 'includes':
			return a.includes(e) ? 1 : 0;
	}
};
