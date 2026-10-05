import {
	REASONING_EFFORT_VALUES,
	type ReasoningEffortValue,
} from '../openai/normalize-reasoning-effort.js';

const REASONING_EFFORT_TITLES: Record<ReasoningEffortValue, string> = {
	none: 'None',
	minimal: 'Minimal',
	low: 'Low',
	medium: 'Medium',
	high: 'High',
	xhigh: 'Extra high',
	max: 'Max',
};

const REASONING_EFFORT_HINT =
	'Some newer models accept only none when tools are enabled. An unsupported value returns a provider error.';

/** Inspector select for OpenAI-compatible chat nodes. Not on Fake LLM. */
const llmReasoningEffortUiSchema = [
	{
		field: 'reasoningEffort',
		type: 'select',
		label: 'Reasoning effort',
		default: '',
		options: [
			{
				value: '',
				title: 'Provider default',
				description: REASONING_EFFORT_HINT,
			},
			...REASONING_EFFORT_VALUES.map((value) => ({
				value,
				title: REASONING_EFFORT_TITLES[value],
				description: REASONING_EFFORT_HINT,
			})),
		],
	},
] as const;

/** Place the select immediately under the Model field. */
export const insertReasoningEffortAfterModel = <
	T extends { readonly field: string },
>(
	schema: readonly T[],
): readonly (T | (typeof llmReasoningEffortUiSchema)[number])[] => {
	const modelIndex = schema.findIndex((item) => item.field === 'model');
	const at = modelIndex < 0 ? schema.length : modelIndex + 1;

	return [
		...schema.slice(0, at),
		...llmReasoningEffortUiSchema,
		...schema.slice(at),
	];
};
