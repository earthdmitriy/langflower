import { LLM_ROLE_PRESET_OPTIONS } from '../llm-role-preset.js';
import {
	AGENT_MAX_ITERATIONS_CAP,
	DEFAULT_AGENT_MAX_ITERATIONS,
} from '../prompt/normalize-max-iterations.js';

/** Provider / Model / Skill — folded into {@link llmPanelUiSchema}. */
const llmProviderModelSkillUiSchema = [
	{
		field: 'providerId',
		type: 'select',
		label: 'Provider',
		optionsSource: 'langflower.providers',
	},
	{
		field: 'model',
		type: 'select',
		label: 'Model',
		optionsSource: 'langflower.models',
		dependsOn: 'providerId',
	},
	{
		field: 'skillId',
		type: 'select',
		label: 'Skill',
		optionsSource: 'langflower.skills',
	},
] as const;

export const llmMaxIterationsUiField = (defaultValue: number, maxCap: number) =>
	({
		field: 'maxIterations',
		type: 'number',
		label: 'Tool-loop max iterations per feedback turn (0 = unlimited)',
		default: defaultValue,
		min: 0,
		max: maxCap,
		step: 1,
	}) as const;

/**
 * Shared Inspector panel floor for all LLM-family nodes (OpenAI, Fake,
 * Sub-Agent, Review, Critique). Nodes may expand after this list; they must
 * not omit these fields.
 */
export const llmPanelUiSchema = [
	{
		field: 'rolePreset',
		type: 'select',
		label: 'Role preset',
		default: 'custom',
		options: LLM_ROLE_PRESET_OPTIONS,
	},
	...llmProviderModelSkillUiSchema,
	{
		field: 'includeAgentsMd',
		type: 'boolean',
		label: 'Include root AGENTS.md',
		default: false,
	},
	{
		field: 'toolPermissions',
		type: 'tool-permission-table',
		label: 'Tool permissions',
		optionsSource: 'node.wiredTools',
	},
	{
		field: 'enabledMcpIds',
		type: 'tool-id-list',
		label: 'Enabled MCP',
		optionsSource: 'langflower.mcpServers',
	},
	llmMaxIterationsUiField(
		DEFAULT_AGENT_MAX_ITERATIONS,
		AGENT_MAX_ITERATIONS_CAP,
	),
	{
		field: 'maxFeedbackTurns',
		type: 'number',
		label: 'Max feedback turns (0 = unlimited)',
		default: 50,
		min: 0,
		max: AGENT_MAX_ITERATIONS_CAP,
		step: 1,
	},
] as const;
