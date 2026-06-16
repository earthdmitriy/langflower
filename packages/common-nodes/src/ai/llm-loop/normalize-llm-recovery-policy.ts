import {
	DEFAULT_LLM_RECOVERY_POLICY,
	type LlmRecoveryPolicy,
} from './llm-loop-types.js';

const normalizePositiveInteger = (
	value: unknown,
	fallback: number,
	max: number,
): number => {
	const number = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(number) || number < 0) {
		return fallback;
	}

	return Math.min(max, Math.floor(number));
};

export const normalizeLlmRecoveryPolicy = (
	params: Readonly<Record<string, unknown>>,
): LlmRecoveryPolicy => ({
	streamIdleTimeoutMs: normalizePositiveInteger(
		params['streamIdleTimeoutMs'],
		DEFAULT_LLM_RECOVERY_POLICY.streamIdleTimeoutMs,
		3_600_000,
	),
	toolTimeoutMs: normalizePositiveInteger(
		params['toolTimeoutMs'],
		DEFAULT_LLM_RECOVERY_POLICY.toolTimeoutMs,
		3_600_000,
	),
	subagentTimeoutMs: normalizePositiveInteger(
		params['subagentTimeoutMs'],
		DEFAULT_LLM_RECOVERY_POLICY.subagentTimeoutMs,
		86_400_000,
	),
	maxTransientRetries: normalizePositiveInteger(
		params['maxTransientRetries'],
		DEFAULT_LLM_RECOVERY_POLICY.maxTransientRetries,
		10,
	),
	retryBaseDelayMs: normalizePositiveInteger(
		params['retryBaseDelayMs'],
		DEFAULT_LLM_RECOVERY_POLICY.retryBaseDelayMs,
		60_000,
	),
	maxToolResultChars: normalizePositiveInteger(
		params['maxToolResultChars'],
		DEFAULT_LLM_RECOVERY_POLICY.maxToolResultChars,
		1_000_000,
	),
});
