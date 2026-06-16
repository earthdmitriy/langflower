/** Shared Inspector fields for provider/tool recovery policy. */
export const llmRecoveryUiSchema = [
	{
		field: 'streamIdleTimeoutMs',
		type: 'number',
		label: 'Stream idle timeout (ms, 0 disables)',
		default: 90000,
		min: 0,
		step: 1,
	},
	{
		field: 'toolTimeoutMs',
		type: 'number',
		label: 'Tool timeout (ms, 0 disables)',
		default: 60000,
		min: 0,
		step: 1,
	},
	{
		field: 'subagentTimeoutMs',
		type: 'number',
		label: 'Sub-Agent timeout (ms, 0 disables)',
		default: 300000,
		min: 0,
		step: 1,
	},
	{
		field: 'maxTransientRetries',
		type: 'number',
		label: 'Transient provider retries',
		default: 2,
		min: 0,
		max: 32,
		step: 1,
	},
] as const;
