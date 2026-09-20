/** Instance role preset — one LLM node type, many configured roles. */

export type LlmRolePreset = 'custom' | 'plan' | 'coder' | 'explorer';

export type ToolPermissionDecision = 'allow' | 'ask' | 'deny';

/** Per-tool coarse decision on the LLM node (`params.toolPermissions`). */
export type ToolPermissionsMap = Readonly<
	Record<string, ToolPermissionDecision>
>;

export type LlmRolePresetDefaults = {
	readonly systemPrompt: string;
	readonly skillId: string;
	/** Visible Inspector table materialization for this preset. */
	readonly toolPermissions: ToolPermissionsMap;
};

export const LLM_ROLE_PRESET_OPTIONS = [
	{ value: 'custom', title: 'Custom' },
	{ value: 'plan', title: 'Plan' },
	{ value: 'coder', title: 'Coder' },
	{ value: 'explorer', title: 'Explorer' },
] as const;

/**
 * Harness builtin ids — twin of `@langflower/tools` `BUILTIN_TOOL_IDS` and
 * shared `HARNESS_BUILTIN_TOOL_OPTIONS`. Kept local so UI can import this
 * module without bundling Node builtins from tools.
 */
export const HARNESS_BUILTIN_TOOL_IDS = [
	'read',
	'glob',
	'grep',
	'edit',
	'write',
	'create',
	'delete',
	'move',
	'sleep',
	'bash',
	'ask_user',
] as const;

export const PLAN_AGENT_SYSTEM_PROMPT = [
	'You are the Plan agent in a Langflower workflow.',
	'',
	"Understand the user's goal, explore the codebase read-only, and produce a clear",
	'implementation plan. Do not modify source code or non-documentation files.',
	'',
	'Write plans in Markdown with sections: Goal, Context, Steps, Risks, Open questions.',
	'',
	'When memory tools are wired, call update_plan with that markdown so the operator',
	'sees the current plan in the work log. There is no separate Plan mode.',
	'',
	'When requirements are ambiguous, use ask_user before finalizing the plan.',
	'You may pass ordered questions with options; the operator can pick chips or type.',
	'To wait without bash, call sleep with seconds from 1 to 300. Do not busy-loop. Stop aborts the wait.',
].join('\n');

export const CODER_AGENT_SYSTEM_PROMPT = [
	'You are the Coder agent in a Langflower workflow.',
	'',
	'Implement the requested changes in the project repository. Make minimal, correct',
	'edits. Prefer precise file edits over large rewrites.',
	'',
	'When tests are available, run them to verify your work. Summarize what you changed',
	'in your final response.',
	'',
	'If you are not sure, call ask_user instead of guessing.',
	'You may pass ordered questions with options; the operator can pick chips or type.',
	'To wait without bash, call sleep with seconds from 1 to 300. Do not busy-loop. Stop aborts the wait.',
].join('\n');

const EXPLORER_AGENT_SYSTEM_PROMPT = [
	'You are the Explorer agent in a Langflower workflow.',
	'',
	'Research the topic using web_fetch. Synthesize findings into clear Markdown notes.',
	'Do not modify application source code—only *.md research notes.',
	'',
	'Cite URLs. Separate facts from inference.',
	'',
	'If you are not sure, call ask_user instead of guessing.',
	'You may pass ordered questions with options; the operator can pick chips or type.',
	'To wait without bash, call sleep with seconds from 1 to 300. Do not busy-loop. Stop aborts the wait.',
].join('\n');

const allAllow = (): ToolPermissionsMap =>
	Object.fromEntries(
		HARNESS_BUILTIN_TOOL_IDS.map((id) => [id, 'allow' as const]),
	);

const CUSTOM_TOOL_PERMISSIONS = allAllow();

const CODER_TOOL_PERMISSIONS: ToolPermissionsMap = {
	...allAllow(),
	bash: 'ask',
	delete: 'ask',
	move: 'ask',
};

const PLAN_TOOL_PERMISSIONS: ToolPermissionsMap = {
	...allAllow(),
	write: 'ask',
	create: 'ask',
	edit: 'deny',
	delete: 'deny',
	move: 'deny',
	bash: 'deny',
};

const EXPLORER_TOOL_PERMISSIONS: ToolPermissionsMap = {
	...allAllow(),
	read: 'allow',
	write: 'ask',
	create: 'ask',
	glob: 'deny',
	grep: 'deny',
	edit: 'deny',
	delete: 'deny',
	move: 'deny',
	bash: 'deny',
};

export const LLM_ROLE_PRESET_DEFAULTS: Readonly<
	Record<LlmRolePreset, LlmRolePresetDefaults>
> = {
	custom: {
		systemPrompt: '',
		skillId: '',
		toolPermissions: CUSTOM_TOOL_PERMISSIONS,
	},
	plan: {
		systemPrompt: PLAN_AGENT_SYSTEM_PROMPT,
		skillId: 'spec-architect',
		toolPermissions: PLAN_TOOL_PERMISSIONS,
	},
	coder: {
		systemPrompt: CODER_AGENT_SYSTEM_PROMPT,
		skillId: 'coder',
		toolPermissions: CODER_TOOL_PERMISSIONS,
	},
	explorer: {
		systemPrompt: EXPLORER_AGENT_SYSTEM_PROMPT,
		skillId: 'explorer',
		toolPermissions: EXPLORER_TOOL_PERMISSIONS,
	},
};

export const parseLlmRolePreset = (value: unknown): LlmRolePreset => {
	if (value === 'plan' || value === 'coder' || value === 'explorer') {
		return value;
	}

	return 'custom';
};

export const resolveEffectiveSkillId = (
	rolePreset: LlmRolePreset,
	skillIdParam: unknown,
): string => {
	const explicit =
		typeof skillIdParam === 'string' ? skillIdParam.trim() : '';

	if (explicit !== '') {
		return explicit;
	}

	return LLM_ROLE_PRESET_DEFAULTS[rolePreset].skillId;
};

const isToolPermissionDecision = (
	value: unknown,
): value is ToolPermissionDecision =>
	value === 'allow' || value === 'ask' || value === 'deny';

/** Parse `params.toolPermissions` into a validated map (empty if unset). */
export const parseToolPermissions = (value: unknown): ToolPermissionsMap => {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	const entries = Object.entries(value as Record<string, unknown>).filter(
		(entry): entry is [string, ToolPermissionDecision] =>
			isToolPermissionDecision(entry[1]),
	);

	return Object.fromEntries(entries);
};

/**
 * Resolve node toolPermissions: explicit map, else preset defaults for the
 * current role.
 */
export const resolveEffectiveToolPermissions = (
	rolePreset: LlmRolePreset,
	toolPermissionsParam: unknown,
): ToolPermissionsMap => {
	const parsed = parseToolPermissions(toolPermissionsParam);

	if (Object.keys(parsed).length > 0) {
		return parsed;
	}

	return LLM_ROLE_PRESET_DEFAULTS[rolePreset].toolPermissions;
};

/**
 * Params patch when the author selects a role preset in the Inspector.
 *
 * - Writes `rolePreset` + materializes `toolPermissions`.
 * - Does **not** touch `skillId` / `systemPrompt`.
 */
export const paramsAfterRolePresetApply = (
	currentParams: Readonly<Record<string, unknown>>,
	rolePreset: LlmRolePreset,
): Readonly<Record<string, unknown>> => {
	const { toolPermissions: _previous, ...rest } = currentParams;
	const defaults = LLM_ROLE_PRESET_DEFAULTS[rolePreset];

	return {
		...rest,
		rolePreset,
		toolPermissions: { ...defaults.toolPermissions },
	};
};

/**
 * Project permission layer shape — structural twin of tools PermissionConfig
 * (UI must not import `@langflower/tools`).
 */
export type ProjectPermissionConfig = Readonly<
	Record<
		string,
		| ToolPermissionDecision
		| Readonly<Record<string, ToolPermissionDecision>>
	>
>;

/** Defaults twin of `@langflower/tools` `DEFAULT_PERMISSION_CONFIG` (allow-all). */
const DEFAULT_HARNESS_PERMISSION: ProjectPermissionConfig = {
	read: { '*': 'allow' },
	glob: { '*': 'allow' },
	grep: { '*': 'allow' },
	edit: { '*': 'allow' },
	write: { '*': 'allow' },
	create: { '*': 'allow' },
	delete: { '*': 'allow' },
	move: { '*': 'allow' },
	sleep: { '*': 'allow' },
	bash: { '*': 'allow' },
	ask_user: { '*': 'allow' },
};

const DECISION_RANK: Readonly<Record<ToolPermissionDecision, number>> = {
	deny: 3,
	ask: 2,
	allow: 1,
};

const rulesForTool = (
	config: ProjectPermissionConfig,
	toolId: string,
): Readonly<Record<string, ToolPermissionDecision>> => {
	const raw = config[toolId] ?? DEFAULT_HARNESS_PERMISSION[toolId];

	if (raw === undefined) {
		return { '*': 'allow' };
	}

	if (isToolPermissionDecision(raw)) {
		return { '*': raw };
	}

	const entries = Object.entries(raw).filter(
		(entry): entry is [string, ToolPermissionDecision] =>
			isToolPermissionDecision(entry[1]),
	);

	if (entries.length === 0) {
		return { '*': 'deny' };
	}

	return Object.fromEntries(entries);
};

/** Coarse floor for Inspector (parity with tools `toolFloorDecision`). */
export const toolFloorDecisionForUi = (
	config: ProjectPermissionConfig | undefined,
	toolId: string,
): ToolPermissionDecision => {
	const merged: ProjectPermissionConfig = {
		...DEFAULT_HARNESS_PERMISSION,
		...(config ?? {}),
	};

	if (
		merged[toolId] === undefined &&
		DEFAULT_HARNESS_PERMISSION[toolId] === undefined
	) {
		return 'allow';
	}

	const rules = rulesForTool(merged, toolId);
	const star = rules['*'];

	if (star !== undefined && Object.keys(rules).length === 1) {
		return star;
	}

	const decisions = Object.values(rules);

	if (decisions.some((decision) => decision === 'allow')) {
		return 'allow';
	}

	if (decisions.some((decision) => decision === 'ask')) {
		return 'ask';
	}

	return 'deny';
};

export const validNodePermissionOptionsForUi = (
	floor: ToolPermissionDecision,
): readonly ToolPermissionDecision[] => {
	if (floor === 'deny') {
		return [];
	}

	if (floor === 'ask') {
		return ['deny', 'ask'];
	}

	return ['deny', 'ask', 'allow'];
};

export const clampToolPermissionForUi = (
	floor: ToolPermissionDecision,
	node: ToolPermissionDecision,
): ToolPermissionDecision =>
	DECISION_RANK[floor] >= DECISION_RANK[node] ? floor : node;

export const isHarnessToolAlwaysDenied = (
	config: ProjectPermissionConfig | undefined,
	toolId: string,
): boolean => {
	const merged: ProjectPermissionConfig = {
		...DEFAULT_HARNESS_PERMISSION,
		...(config ?? {}),
	};

	if (
		merged[toolId] === undefined &&
		DEFAULT_HARNESS_PERMISSION[toolId] === undefined
	) {
		return false;
	}

	const decisions = Object.values(rulesForTool(merged, toolId));

	return (
		decisions.length > 0 &&
		decisions.every((decision) => decision === 'deny')
	);
};
