import type { UISchemaGroup } from '@langflower/node-sdk/create-typed-ui-schema';
import { DEFAULT_CONTEXT_SIZE } from '../openai/normalize-compaction-params.js';

const llmCompactionGroup = {
	label: 'Compaction',
	collapsed: true,
	order: 40,
} as const satisfies UISchemaGroup;

/** Shared Inspector fields for OpenAI-compatible chat compaction. */
export const llmCompactionUiSchema = [
	{
		field: 'contextSize',
		group: llmCompactionGroup,
		type: 'number',
		label: 'Context size (approx tokens)',
		default: DEFAULT_CONTEXT_SIZE,
		min: 0,
		step: 1,
	},
	{
		field: 'compactOnError',
		group: llmCompactionGroup,
		type: 'boolean',
		label: 'Compact on context error',
		default: true,
	},
] as const;
