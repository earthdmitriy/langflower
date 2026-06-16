import type { ToolInvokeResult } from './harness-types.js';
import {
	formatPermissionDeniedText,
	grantKeyForCall,
	permissionAskSummary,
	resolvePermission,
	type PermissionAskRequest,
	type PermissionConfig,
	type PermissionDecision,
} from './permission.js';

export type GateToolCallOptions = {
	readonly toolId: string;
	readonly detail: string;
	readonly grants: Set<string>;
	readonly permission: PermissionConfig;
	readonly requestPermission?: (
		request: PermissionAskRequest,
	) => Promise<PermissionDecision>;
	/**
	 * When the tool id has no entry in `permission`, use this decision
	 * instead of {@link resolvePermission} (MCP tools → `'ask'`).
	 */
	readonly whenMissingToolConfig?: PermissionDecision;
};

export const deniedToolResult = (
	toolId: string,
	detail: string,
): ToolInvokeResult => ({
	ok: false,
	text: formatPermissionDeniedText(toolId, detail),
});

/** Shared ask/grant/deny sequencing for project harness + MCP runtime. */
export const gateToolCall = async (
	options: GateToolCallOptions,
): Promise<'allow' | 'deny'> => {
	const {
		toolId,
		detail,
		grants,
		permission,
		requestPermission,
		whenMissingToolConfig,
	} = options;
	const key = grantKeyForCall(toolId, detail);

	if (grants.has(key)) {
		return 'allow';
	}

	const decision =
		whenMissingToolConfig !== undefined && permission[toolId] === undefined
			? whenMissingToolConfig
			: resolvePermission(permission, toolId, detail);

	if (decision === 'allow') {
		return 'allow';
	}

	if (decision === 'deny') {
		return 'deny';
	}

	if (requestPermission === undefined) {
		return 'deny';
	}

	const reply = await requestPermission({
		toolId,
		detail,
		summary: permissionAskSummary(toolId, detail),
	});

	if (reply === 'allow') {
		grants.add(key);
		return 'allow';
	}

	return 'deny';
};
