import type { ToolHandle } from '@langflower/node-sdk';
import type { Harness } from './harness-types.js';
import { isToolAlwaysDenied, type PermissionConfig } from './permission.js';

type HostInvokeCtx = {
	readonly signal?: AbortSignal;
};

/**
 * Wrap harness builtins as {@link ToolHandle}[].
 * Builtins that are always-deny under {@link permission} are omitted so the
 * model cannot call tools that the gate would refuse without ask.
 */
export const wrapBuiltinToolHandles = (
	harness: Harness,
	permission?: PermissionConfig,
): readonly ToolHandle[] => {
	const filtered = harness
		.listBuiltinRegistrations()
		.filter((reg) => !isToolAlwaysDenied(permission, reg.toolId));

	return filtered.map((reg): ToolHandle => ({
		toolId: reg.toolId,
		name: reg.name,
		description: reg.description,
		inputSchema: reg.inputSchema,
		invoke: async (args, toolCtx?) => {
			const hostCtx = toolCtx as HostInvokeCtx | undefined;
			const result = await harness.invoke({
				toolId: reg.toolId,
				args,
				...(hostCtx?.signal !== undefined
					? { signal: hostCtx.signal }
					: {}),
			});

			if (!result.ok) {
				throw new Error(result.text);
			}

			return result.text;
		},
	}));
};
