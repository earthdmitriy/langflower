import { DEFAULT_CONTEXT_SIZE } from './openai/normalize-compaction-params.js';

/** Shared Inspector fields for OpenAI-compatible chat compaction. */
export const llmCompactionUiSchema = [
	{
		field: 'contextSize',
		type: 'number',
		label: 'Context size (approx tokens)',
		default: DEFAULT_CONTEXT_SIZE,
		min: 0,
		step: 1,
	},
	{
		field: 'compactOnError',
		type: 'boolean',
		label: 'Compact on context error',
		default: false,
	},
] as const;
