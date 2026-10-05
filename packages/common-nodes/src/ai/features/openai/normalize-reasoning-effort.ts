import type OpenAI from 'openai';

const REASONING_EFFORT_VALUE_LIST = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
	'max',
] as const;

export type ReasoningEffortValue = (typeof REASONING_EFFORT_VALUE_LIST)[number];

type SdkReasoningEffort = Exclude<OpenAI.ReasoningEffort, null>;

type MissingSdkEffort = Exclude<SdkReasoningEffort, ReasoningEffortValue>;

/**
 * Inspector / request values for `reasoning_effort`. The `satisfies` clause
 * fails typecheck when this list drifts from `OpenAI.ReasoningEffort`.
 */
export const REASONING_EFFORT_VALUES =
	REASONING_EFFORT_VALUE_LIST satisfies readonly SdkReasoningEffort[] &
		([MissingSdkEffort] extends [never] ? unknown : never);

export const normalizeReasoningEffort = (
	value: unknown,
): ReasoningEffortValue | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	return REASONING_EFFORT_VALUES.find((effort) => effort === value);
};
