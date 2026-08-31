import {
	DEFAULT_AUTOKICK_USER_MESSAGE,
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

const normalizeBoolean = (value: unknown, fallback: boolean): boolean =>
	typeof value === 'boolean' ? value : fallback;

const normalizePenalty = (value: unknown, fallback: number): number => {
	const number = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(number)) {
		return fallback;
	}

	return Math.min(2, Math.max(-2, number));
};

const readRecord = (value: unknown): Record<string, unknown> | undefined =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const nestedDeadLoop = (
	params: Readonly<Record<string, unknown>>,
): Record<string, unknown> => readRecord(params['deadLoop']) ?? {};

const nestedPenalty = (
	params: Readonly<Record<string, unknown>>,
): Record<string, unknown> => readRecord(params['autokickPenaltyDelta']) ?? {};

export const normalizeLlmRecoveryPolicy = (
	params: Readonly<Record<string, unknown>>,
): LlmRecoveryPolicy => {
	const deadLoop = nestedDeadLoop(params);
	const penalty = nestedPenalty(params);
	const autokickBackoffMs = Math.max(
		1_000,
		normalizePositiveInteger(
			params['autokickBackoffMs'],
			DEFAULT_LLM_RECOVERY_POLICY.autokickBackoffMs,
			3_600_000,
		),
	);
	const autokickMaxBackoffMs = Math.max(
		autokickBackoffMs,
		normalizePositiveInteger(
			params['autokickMaxBackoffMs'],
			DEFAULT_LLM_RECOVERY_POLICY.autokickMaxBackoffMs,
			3_600_000,
		),
	);
	const kick =
		typeof params['autokickUserMessage'] === 'string' &&
		params['autokickUserMessage'].trim().length > 0
			? params['autokickUserMessage'].trim()
			: DEFAULT_AUTOKICK_USER_MESSAGE;

	return {
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
		autokickOnIdle: normalizeBoolean(
			params['autokickOnIdle'],
			DEFAULT_LLM_RECOVERY_POLICY.autokickOnIdle,
		),
		deadLoopEnabled: normalizeBoolean(
			params['deadLoopEnabled'],
			DEFAULT_LLM_RECOVERY_POLICY.deadLoopEnabled,
		),
		maxAutokickAttempts: normalizePositiveInteger(
			params['maxAutokickAttempts'],
			DEFAULT_LLM_RECOVERY_POLICY.maxAutokickAttempts,
			1_000,
		),
		autokickBackoffMs,
		autokickMaxBackoffMs,
		autokickUserMessage: kick,
		autokickPenaltyDelta: {
			frequency: normalizePenalty(
				penalty['frequency'] ?? params['autokickPenaltyFrequency'],
				DEFAULT_LLM_RECOVERY_POLICY.autokickPenaltyDelta.frequency,
			),
			presence: normalizePenalty(
				penalty['presence'] ?? params['autokickPenaltyPresence'],
				DEFAULT_LLM_RECOVERY_POLICY.autokickPenaltyDelta.presence,
			),
		},
		deadLoop: {
			maxWindowTokens: Math.min(
				8_000,
				Math.max(
					10,
					normalizePositiveInteger(
						deadLoop['maxWindowTokens'] ??
							params['deadLoopMaxWindowTokens'],
						DEFAULT_LLM_RECOVERY_POLICY.deadLoop.maxWindowTokens,
						8_000,
					),
				),
			),
			consecutiveThreshold: Math.max(
				1,
				normalizePositiveInteger(
					deadLoop['consecutiveThreshold'] ??
						params['deadLoopConsecutiveThreshold'],
					DEFAULT_LLM_RECOVERY_POLICY.deadLoop.consecutiveThreshold,
					100,
				),
			),
			minRepetitions: Math.max(
				1,
				normalizePositiveInteger(
					deadLoop['minRepetitions'] ??
						params['deadLoopMinRepetitions'],
					DEFAULT_LLM_RECOVERY_POLICY.deadLoop.minRepetitions,
					20,
				),
			),
			minPatternTokens: Math.max(
				1,
				normalizePositiveInteger(
					deadLoop['minPatternTokens'] ??
						params['deadLoopMinPatternTokens'],
					DEFAULT_LLM_RECOVERY_POLICY.deadLoop.minPatternTokens,
					100,
				),
			),
			structuralRunCap: Math.min(
				2_000,
				Math.max(
					16,
					normalizePositiveInteger(
						deadLoop['structuralRunCap'] ??
							params['deadLoopStructuralRunCap'],
						DEFAULT_LLM_RECOVERY_POLICY.deadLoop.structuralRunCap,
						2_000,
					),
				),
			),
		},
	};
};
