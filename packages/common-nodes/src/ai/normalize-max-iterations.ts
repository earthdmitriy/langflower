/**
 * Normalize Inspector / param `maxIterations`.
 * `0` = unlimited; invalid / negative → `fallback`; positive → floor + `maxCap`.
 */
export const normalizeMaxIterations = (
	value: unknown,
	options: {
		readonly fallback: number;
		readonly maxCap: number;
	},
): number => {
	const n = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(n) || n < 0) {
		return options.fallback;
	}

	if (n === 0) {
		return 0;
	}

	const floored = Math.floor(n);
	if (floored < 1) {
		return options.fallback;
	}

	return Math.min(options.maxCap, floored);
};

/** Soft upper bound only — Inspector lets users raise freely. */
export const AGENT_MAX_ITERATIONS_CAP = Number.MAX_SAFE_INTEGER;
export const PATH_CHOICE_MAX_ITERATIONS_CAP = Number.MAX_SAFE_INTEGER;
export const DEFAULT_AGENT_MAX_ITERATIONS = 100;
export const DEFAULT_PATH_CHOICE_MAX_ITERATIONS = 5;
