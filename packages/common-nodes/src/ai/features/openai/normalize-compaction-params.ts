export type LlmCompactionConfig = {
	/**
	 * Approx input token budget. `0` disables proactive compaction.
	 * Invalid values coerce to the Inspector default `200000`.
	 */
	readonly contextSize: number;
	/** Retry once after a typed context-length error by force-compacting. */
	readonly compactOnError: boolean;
};

export const DEFAULT_CONTEXT_SIZE = 200000;
const MAX_CONTEXT_SIZE = 1_000_000;

export const DISABLED_COMPACTION_CONFIG: LlmCompactionConfig = {
	contextSize: 0,
	compactOnError: false,
};

export const normalizeContextSize = (value: unknown): number => {
	const n = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(n)) {
		return DEFAULT_CONTEXT_SIZE;
	}

	if (n <= 0) {
		return 0;
	}

	return Math.min(MAX_CONTEXT_SIZE, Math.floor(n));
};

export const normalizeCompactOnError = (value: unknown): boolean =>
	value === true;

export const normalizeCompactionConfig = (
	params: Readonly<Record<string, unknown>>,
): LlmCompactionConfig => ({
	contextSize: normalizeContextSize(params['contextSize']),
	compactOnError: normalizeCompactOnError(params['compactOnError']),
});
