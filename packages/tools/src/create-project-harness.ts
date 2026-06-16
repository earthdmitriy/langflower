import {
	BUILTIN_REGISTRATIONS,
	BUILTIN_TOOL_IDS,
	invokeBuiltin,
	isBuiltinToolId,
	type BuiltinToolId,
	type HandlerContext,
} from './builtins/catalog.js';
import { deniedToolResult, gateToolCall } from './gate-tool-call.js';
import type {
	Harness,
	ToolInvokeCall,
	ToolInvokeResult,
} from './harness-types.js';
import {
	DEFAULT_PERMISSION_CONFIG,
	permissionDetailForCall,
	type PermissionAskRequest,
	type PermissionConfig,
	type PermissionDecision,
} from './permission.js';

export type { Harness, ToolInvokeCall, ToolInvokeResult };
export type { BuiltinToolRegistration } from './harness-types.js';
export type { PermissionAskRequest, PermissionConfig };

export type CreateHarnessOptions = {
	readonly projectRoot: string;
	readonly denyPaths?: readonly string[];
	/**
	 * Absolute (or project-relative) directories trusted outside the project
	 * root — e.g. an Obsidian vault (`harness.allowedRoots` in jsonc).
	 */
	readonly allowedRoots?: readonly string[];
	/**
	 * When false (default), bash handler refuses even after permission allow.
	 * Server sets true and relies on {@link permission} for ask/deny.
	 */
	readonly bashEnabled?: boolean;
	/** OpenCode-style rules from `langflower.jsonc` (merged over defaults). */
	readonly permission?: PermissionConfig;
	/**
	 * Called when policy resolves to `ask`. Return allow/deny.
	 * Missing callback + ask → fail closed (deny).
	 */
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<PermissionDecision>;
};

/**
 * Project-root sandboxed harness for Langflower **builtin** agent tools.
 * Domain/custom tools expose `ToolHandle.invoke` (imported from
 * `@langflower/tools` domain configs) — not via a hidden toolId registry here.
 */
export const createProjectHarness = (
	options: CreateHarnessOptions,
): Harness => {
	const ctx: HandlerContext = {
		projectRoot: options.projectRoot,
		denyPaths: options.denyPaths ?? [],
		allowedRoots: options.allowedRoots ?? [],
		bashEnabled: options.bashEnabled === true,
	};
	const permission: PermissionConfig = {
		...DEFAULT_PERMISSION_CONFIG,
		...(options.permission ?? {}),
	};
	const grants = new Set<string>();

	const gate = (toolId: string, detail: string) =>
		gateToolCall({
			toolId,
			detail,
			grants,
			permission,
			...(options.requestPermission !== undefined
				? { requestPermission: options.requestPermission }
				: {}),
		});

	return {
		listBuiltinRegistrations: () => BUILTIN_REGISTRATIONS,
		authorize: async (call) => {
			const toolId = call.toolId.trim();
			const detail = permissionDetailForCall(toolId, call.args);
			return gate(toolId, detail);
		},
		invoke: async (call) => {
			const toolId = call.toolId.trim();

			if (!isBuiltinToolId(toolId)) {
				return {
					ok: false,
					text: `Unknown builtin tool «${call.toolId}». Available: ${BUILTIN_TOOL_IDS.join(', ')}. Domain/custom tools must expose registration.handler (import from @langflower/tools), not harness toolId lookup.`,
				};
			}

			const detail = permissionDetailForCall(toolId, call.args);
			const access = await gate(toolId, detail);

			if (access === 'deny') {
				return deniedToolResult(toolId, detail);
			}

			try {
				const text = await invokeBuiltin(
					toolId as BuiltinToolId,
					ctx,
					call.args,
				);
				return { ok: true, text };
			} catch (error) {
				const text =
					error instanceof Error ? error.message : String(error);
				return { ok: false, text };
			}
		},
	};
};

export { BUILTIN_TOOL_IDS, isBuiltinToolId } from './builtins/catalog.js';
