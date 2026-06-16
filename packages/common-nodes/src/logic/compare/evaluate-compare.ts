export type CompareOp =
	'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte' | 'contains' | 'matches';

export const COMPARE_OP_OPTIONS = [
	{ title: 'Equal', value: 'eq' },
	{ title: 'not equal', value: 'ne' },
	{ title: 'less than', value: 'lt' },
	{ title: 'greater than', value: 'gt' },
	{ title: 'less or equal', value: 'lte' },
	{ title: 'greater or equal', value: 'gte' },
	{ title: 'contains', value: 'contains' },
	{ title: 'matches (regex)', value: 'matches' },
] as const;

export const parseCompareOp = (raw: unknown): CompareOp => {
	switch (raw) {
		case 'eq':
		case 'ne':
		case 'lt':
		case 'gt':
		case 'lte':
		case 'gte':
		case 'contains':
		case 'matches':
			return raw;
		default:
			return 'eq';
	}
};

export const evaluateCompare = (
	a: unknown,
	b: unknown,
	op: CompareOp,
): boolean => {
	switch (op) {
		case 'eq':
			return Object.is(a, b) || a === b;
		case 'ne':
			return !(Object.is(a, b) || a === b);
		case 'lt':
			return toComparableNumber(a) < toComparableNumber(b);
		case 'gt':
			return toComparableNumber(a) > toComparableNumber(b);
		case 'lte':
			return toComparableNumber(a) <= toComparableNumber(b);
		case 'gte':
			return toComparableNumber(a) >= toComparableNumber(b);
		case 'contains':
			return String(a ?? '').includes(String(b ?? ''));
		case 'matches':
			return matchesRegex(String(a ?? ''), String(b ?? ''));
	}
};

const toComparableNumber = (value: unknown): number => {
	if (typeof value === 'number') {
		return value;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const matchesRegex = (value: string, pattern: string): boolean => {
	try {
		return new RegExp(pattern).test(value);
	} catch {
		return false;
	}
};
