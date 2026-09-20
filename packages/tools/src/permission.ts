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
	move: { '*': 'allow' },
	sleep: { '*': 'allow' },
	bash: { '*': 'allow' },
	ask_user: { '*': 'allow' },
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

const posixArg = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0
		? value.replace(/\\/g, '/')
		: undefined;

const singlePermissionDetail = (
	toolId: string,
	args: Readonly<Record<string, unknown>>,
): string => {
	if (toolId === 'bash') {
		return typeof args.command === 'string' ? args.command : '';
	}

	if (toolId === 'sleep') {
		return typeof args.seconds === 'number' && Number.isFinite(args.seconds)
			? `${String(Math.trunc(args.seconds))}s`
			: '*';
	}

	if (toolId === 'ask_user') {
		if (
			typeof args.question === 'string' &&
			args.question.trim().length > 0
		) {
			return args.question;
		}

		const questions = args.questions;
		if (!Array.isArray(questions) || questions.length === 0) {
			return '';
		}

		const first = questions[0];
		if (
			first !== null &&
			typeof first === 'object' &&
			!Array.isArray(first) &&
			'prompt' in first &&
			typeof first.prompt === 'string'
		) {
			return first.prompt;
		}

		return '';
	}

	return (
		posixArg(args.path) ??
		posixArg(args.file) ??
		posixArg(args.url) ??
		posixArg(args.key) ??
		posixArg(args.collectionId) ??
		'*'
	);
};

/**
 * Path/command strings used for pattern matching.
 * `move` gates both `from` and `to` independently.
 */
export const permissionDetailsForCall = (
	toolId: string,
	args: Readonly<Record<string, unknown>>,
): readonly string[] => {
	if (toolId === 'move') {
		const details = [posixArg(args.from), posixArg(args.to)].filter(
			(value): value is string => value !== undefined,
		);
		return details.length > 0 ? details : ['*'];
	}

	return [singlePermissionDetail(toolId, args)];
};

/** Extract the path/command string used for pattern matching. */
export const permissionDetailForCall = (
	toolId: string,
	args: Readonly<Record<string, unknown>>,
): string => permissionDetailsForCall(toolId, args)[0] ?? '*';

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
