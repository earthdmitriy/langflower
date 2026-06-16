/**
 * OpenCode-style permission resolver for harness tools.
 *
 * Policy comes from `langflower.jsonc` `permission` (project floor) plus
 * per-node `toolPermissions` (clamped to floor). This is the runtime security
 * boundary.
 */

export type PermissionDecision = 'allow' | 'ask' | 'deny';

/** Per-tool rules: pattern → decision, or a single decision for `*`. */
export type PermissionToolConfig =
	PermissionDecision | Readonly<Record<string, PermissionDecision>>;

/** Top-level `permission` block keyed by tool id (`read`, `bash`, …). */
export type PermissionConfig = Readonly<Record<string, PermissionToolConfig>>;

export type PermissionAskRequest = {
	readonly toolId: string;
	readonly detail: string;
	readonly summary: string;
};

/** Defaults when `permission` is missing or incomplete — allow-all. */
export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
	read: { '*': 'allow' },
	glob: { '*': 'allow' },
	grep: { '*': 'allow' },
	edit: { '*': 'allow' },
	write: { '*': 'allow' },
	create: { '*': 'allow' },
	delete: { '*': 'allow' },
	bash: { '*': 'allow' },
};

const DECISION_RANK: Readonly<Record<PermissionDecision, number>> = {
	deny: 3,
	ask: 2,
	allow: 1,
};

const isDecision = (value: unknown): value is PermissionDecision =>
	value === 'allow' || value === 'ask' || value === 'deny';

const escapeRegExp = (text: string): string =>
	text.replace(/[.+^${}()|[\]\\]/g, '\\$&');

/**
 * Match OpenCode-style patterns:
 * - `*` — anything
 * - path globs with `**` / `*` (e.g. all markdown under a tree, `docs/**`)
 * - command prefixes with trailing `*` (`git diff*`, `rm *`)
 */
export const matchPermissionPattern = (
	pattern: string,
	detail: string,
): boolean => {
	const normalizedPattern = pattern.trim();
	const normalizedDetail = detail;

	if (normalizedPattern.length === 0) {
		return false;
	}

	if (normalizedPattern === '*') {
		return true;
	}

	const pathStyle =
		normalizedPattern.includes('/') || normalizedPattern.includes('**');

	if (pathStyle) {
		const posixDetail = normalizedDetail.replace(/\\/g, '/');
		let regexSource = '';

		for (let i = 0; i < normalizedPattern.length; i += 1) {
			if (normalizedPattern.startsWith('**/', i)) {
				regexSource += '(?:.*/)?';
				i += 2;
				continue;
			}

			if (normalizedPattern.startsWith('**', i)) {
				regexSource += '.*';
				i += 1;
				continue;
			}

			const ch = normalizedPattern[i] ?? '';

			if (ch === '*') {
				regexSource += '[^/]*';
				continue;
			}

			regexSource += escapeRegExp(ch);
		}

		return new RegExp(`^${regexSource}$`).test(posixDetail);
	}

	let regexSource = '';

	for (const ch of normalizedPattern) {
		if (ch === '*') {
			regexSource += '[\\s\\S]*';
			continue;
		}

		regexSource += escapeRegExp(ch);
	}

	return new RegExp(`^${regexSource}$`).test(normalizedDetail);
};

const rulesForTool = (
	config: PermissionConfig,
	toolId: string,
): Readonly<Record<string, PermissionDecision>> => {
	const raw = config[toolId] ?? DEFAULT_PERMISSION_CONFIG[toolId];

	if (raw === undefined) {
		return { '*': 'deny' };
	}

	if (isDecision(raw)) {
		return { '*': raw };
	}

	const entries = Object.entries(raw).filter(
		(entry): entry is [string, PermissionDecision] => isDecision(entry[1]),
	);

	if (entries.length === 0) {
		return { '*': 'deny' };
	}

	return Object.fromEntries(entries);
};

/**
 * Resolve allow|ask|deny for one tool call.
 * Among matching patterns, longest pattern wins; ties prefer deny > ask > allow.
 */
export const resolvePermission = (
	config: PermissionConfig | undefined,
	toolId: string,
	detail: string,
): PermissionDecision => {
	const merged: PermissionConfig = {
		...DEFAULT_PERMISSION_CONFIG,
		...(config ?? {}),
	};
	const rules = rulesForTool(merged, toolId);
	const matches = Object.entries(rules).filter(([pattern]) =>
		matchPermissionPattern(pattern, detail),
	);

	if (matches.length === 0) {
		return 'deny';
	}

	matches.sort((a, b) => {
		const lengthDelta = b[0].length - a[0].length;

		if (lengthDelta !== 0) {
			return lengthDelta;
		}

		return DECISION_RANK[b[1]] - DECISION_RANK[a[1]];
	});

	return matches[0]?.[1] ?? 'deny';
};

/** Extract the path/command string used for pattern matching. */
export const permissionDetailForCall = (
	toolId: string,
	args: Readonly<Record<string, unknown>>,
): string => {
	if (toolId === 'bash') {
		return typeof args.command === 'string' ? args.command : '';
	}

	if (typeof args.path === 'string' && args.path.length > 0) {
		return args.path.replace(/\\/g, '/');
	}

	if (typeof args.file === 'string' && args.file.length > 0) {
		return args.file.replace(/\\/g, '/');
	}

	if (typeof args.url === 'string' && args.url.length > 0) {
		return args.url;
	}

	if (typeof args.key === 'string' && args.key.length > 0) {
		return args.key;
	}

	if (typeof args.collectionId === 'string' && args.collectionId.length > 0) {
		return args.collectionId;
	}

	return '*';
};

const MCP_DETAIL_ARGS_CAP = 180;

/**
 * Permission detail for an MCP invoke — remote tool name plus a stable args
 * digest so grants/patterns are not collapsed to a single `'mcp'` key.
 */
export const permissionDetailForMcpCall = (
	remoteName: string,
	args: Readonly<Record<string, unknown>>,
): string => {
	const name = remoteName.trim().length > 0 ? remoteName.trim() : 'mcp';
	const fromArgs = permissionDetailForCall('_', args);

	if (fromArgs !== '*') {
		return `${name}:${fromArgs}`;
	}

	const keys = Object.keys(args).sort();

	if (keys.length === 0) {
		return name;
	}

	try {
		const digest = JSON.stringify(args, keys);

		if (digest.length <= MCP_DETAIL_ARGS_CAP) {
			return `${name}:${digest}`;
		}

		return `${name}:${digest.slice(0, MCP_DETAIL_ARGS_CAP)}…`;
	} catch {
		return name;
	}
};

export const permissionAskSummary = (
	toolId: string,
	detail: string,
): string => {
	if (toolId === 'bash') {
		return `Allow bash: ${detail.length > 0 ? detail : '(empty command)'}?`;
	}

	return `Allow ${toolId}: ${detail.length > 0 ? detail : '(no path)'}?`;
};

export const grantKeyForCall = (toolId: string, detail: string): string =>
	`${toolId}\0${detail}`;

/**
 * Shallow per-tool merge: later layers replace whole tool configs.
 * Used for project config ← node toolPermissions overlays.
 */
export const mergePermissionConfigs = (
	...layers: readonly (PermissionConfig | undefined)[]
): PermissionConfig =>
	layers.reduce<PermissionConfig>(
		(acc, layer) => (layer === undefined ? acc : { ...acc, ...layer }),
		{},
	);

export const permissionDecisionRank = (decision: PermissionDecision): number =>
	DECISION_RANK[decision];

/** Stricter of two decisions (`deny` > `ask` > `allow`). */
export const stricterPermission = (
	left: PermissionDecision,
	right: PermissionDecision,
): PermissionDecision =>
	DECISION_RANK[left] >= DECISION_RANK[right] ? left : right;

/**
 * Coarse floor decision for Inspector radios.
 * Shorthand / `*` rule; if only patterns: any allow → allow ceiling, else any
 * ask → ask, else deny.
 */
export const toolFloorDecision = (
	config: PermissionConfig | undefined,
	toolId: string,
): PermissionDecision => {
	const merged: PermissionConfig = {
		...DEFAULT_PERMISSION_CONFIG,
		...(config ?? {}),
	};

	if (
		merged[toolId] === undefined &&
		DEFAULT_PERMISSION_CONFIG[toolId] === undefined
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

/** Clamp a node choice so it cannot loosen past the project floor. */
export const clampToolPermission = (
	floor: PermissionDecision,
	node: PermissionDecision,
): PermissionDecision => stricterPermission(floor, node);

/**
 * Radios valid under floor (node may only tighten).
 * Floor deny → empty (row should be hidden).
 */
export const validNodePermissionOptions = (
	floor: PermissionDecision,
): readonly PermissionDecision[] => {
	if (floor === 'deny') {
		return [];
	}

	if (floor === 'ask') {
		return ['deny', 'ask'];
	}

	return ['deny', 'ask', 'allow'];
};

/**
 * True when every rule for `toolId` is `deny` (no allow/ask path).
 * Unknown tool ids (no default and no project entry) are **not** always-deny
 * — wired/domain tools are outside the harness permission map.
 */
export const isToolAlwaysDenied = (
	config: PermissionConfig | undefined,
	toolId: string,
): boolean => {
	const merged: PermissionConfig = {
		...DEFAULT_PERMISSION_CONFIG,
		...(config ?? {}),
	};

	if (
		merged[toolId] === undefined &&
		DEFAULT_PERMISSION_CONFIG[toolId] === undefined
	) {
		return false;
	}

	const rules = rulesForTool(merged, toolId);
	const decisions = Object.values(rules);

	return (
		decisions.length > 0 &&
		decisions.every((decision) => decision === 'deny')
	);
};

/**
 * Overlay coarse node toolPermissions onto project config, clamping each
 * node decision to the project floor.
 */
export const mergeProjectAndNodePermissions = (
	projectPermission: PermissionConfig | undefined,
	nodeToolPermissions:
		Readonly<Record<string, PermissionDecision>> | undefined,
): PermissionConfig => {
	const project: PermissionConfig = {
		...DEFAULT_PERMISSION_CONFIG,
		...(projectPermission ?? {}),
	};

	if (nodeToolPermissions === undefined) {
		return projectPermission ?? {};
	}

	const nodeEntries: Array<[string, PermissionDecision]> = [];

	for (const [toolId, decision] of Object.entries(nodeToolPermissions)) {
		if (!isDecision(decision)) {
			continue;
		}

		const floor = toolFloorDecision(project, toolId);
		nodeEntries.push([toolId, clampToolPermission(floor, decision)]);
	}

	return mergePermissionConfigs(
		projectPermission,
		Object.fromEntries(nodeEntries),
	);
};

/** Hint appended to permission-deny tool results (author vs runtime gate). */
export const PERMISSION_DENY_HINT =
	'Tighten or loosen via Inspector tool permissions (within project floor) or edit permission.<tool> in .langflower/langflower.jsonc.';

export const formatPermissionDeniedText = (
	toolId: string,
	detail: string,
): string => {
	const target = detail.length > 0 ? `${toolId} (${detail})` : toolId;

	return `Permission denied for ${target}. Effective policy is deny (project floor and/or node toolPermissions). ${PERMISSION_DENY_HINT}`;
};
