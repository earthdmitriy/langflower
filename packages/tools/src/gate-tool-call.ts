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
	readonly details: readonly string[];
	readonly grants: Set<string>;
	readonly permission: PermissionConfig;
	readonly requestPermission?: (
		request: PermissionAskRequest,
		signal?: AbortSignal,
	) => Promise<PermissionDecision>;
	readonly signal?: AbortSignal;
};

export const deniedToolResult = (
	toolId: string,
	detail: string,
): ToolInvokeResult => ({
	ok: false,
	text: formatPermissionDeniedText(toolId, detail),
});

/** Shared ask/grant/deny sequencing for project harness builtins. */
export const gateToolCall = async (
	options: GateToolCallOptions,
): Promise<'allow' | 'deny'> => {
	const { toolId, grants, permission, requestPermission } = options;
	const details = options.details.length > 0 ? options.details : ['*'];

	const pendingAsk: string[] = [];

	for (const detail of details) {
		if (grants.has(grantKeyForCall(toolId, detail))) {
			continue;
		}

		const decision = resolvePermission(permission, toolId, detail);

		if (decision === 'deny') {
			return 'deny';
		}

		if (decision === 'ask') {
			pendingAsk.push(detail);
		}
	}

	if (pendingAsk.length === 0) {
		return 'allow';
	}

	if (requestPermission === undefined) {
		return 'deny';
	}

	const combined = details.join(' → ');
	const reply = await requestPermission(
		{
			toolId,
			detail: combined,
			summary: permissionAskSummary(toolId, combined),
		},
		options.signal,
	);

	if (reply === 'allow') {
		for (const detail of pendingAsk) {
			grants.add(grantKeyForCall(toolId, detail));
		}

		return 'allow';
	}

	return 'deny';
};
