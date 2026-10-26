import type { UISchemaGroup } from '@langflower/node-sdk/create-typed-ui-schema';
import { LLM_ROLE_PRESET_OPTIONS } from '../llm-role-preset.js';
import {
	AGENT_MAX_ITERATIONS_CAP,
	DEFAULT_AGENT_MAX_ITERATIONS,
} from '../prompt/normalize-max-iterations.js';

// Expanded groups sit above collapsed ones (order 10–20 vs 30+).
const llmToolsGroup = {
	label: 'Tools',
	order: 10,
} as const satisfies UISchemaGroup;

const llmSessionContextGroup = {
	label: 'Session context',
	order: 20,
} as const satisfies UISchemaGroup;

const llmLimitsGroup = {
	label: 'Limits',
	collapsed: true,
	order: 30,
} as const satisfies UISchemaGroup;

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

/**
 * OpenAI / Fake / Review / Critique only. Not part of {@link llmPanelUiSchema}
 * — Sub-Agent reuses that list and must not show this control.
 */
export const llmResetSessionOnInputUiField = {
	field: 'resetSessionOnInput',
	type: 'boolean',
	label: 'Reset session on input',
	default: false,
} as const;

export const llmMaxIterationsUiField = (defaultValue: number, maxCap: number) =>
	({
		field: 'maxIterations',
		group: llmLimitsGroup,
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
		group: llmSessionContextGroup,
		type: 'boolean',
		label: 'Include root AGENTS.md',
		default: false,
	},
	{
		field: 'includeReadme',
		group: llmSessionContextGroup,
		type: 'boolean',
		label: 'Include root README.md',
		default: false,
	},
	{
		field: 'includeEnvironment',
		group: llmSessionContextGroup,
		type: 'boolean',
		label: 'Include environment (OS, work dir, date)',
		default: true,
	},
	{
		field: 'includeHarness',
		group: llmSessionContextGroup,
		type: 'boolean',
		label: 'Include Langflower harness info',
		default: true,
	},
	{
		field: 'includeSkillList',
		group: llmSessionContextGroup,
		type: 'boolean',
		label: 'List available skills',
		default: false,
	},
	{
		field: 'toolPermissions',
		group: llmToolsGroup,
		type: 'tool-permission-table',
		label: 'Tool permissions',
		optionsSource: 'node.wiredTools',
	},
	{
		field: 'enabledMcpIds',
		group: llmToolsGroup,
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
		group: llmLimitsGroup,
		type: 'number',
		label: 'Max feedback turns (0 = unlimited)',
		default: 50,
		min: 0,
		max: AGENT_MAX_ITERATIONS_CAP,
		step: 1,
	},
] as const;
