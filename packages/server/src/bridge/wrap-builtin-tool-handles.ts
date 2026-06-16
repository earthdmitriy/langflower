import type { ToolHandle } from '@langflower/node-sdk';
import type {
	BuiltinToolRegistration,
	Harness,
} from '@langflower/tools/create-project-harness';
import {
	isToolAlwaysDenied,
	type PermissionConfig,
} from '@langflower/tools/permission';

const filterEnabledBuiltins = (
	builtins: readonly BuiltinToolRegistration[],
	enabledToolIds: readonly string[] | undefined,
): readonly BuiltinToolRegistration[] => {
	if (enabledToolIds === undefined) {
		return builtins;
	}

	if (enabledToolIds.length === 0) {
		return [];
	}

	const allowed = new Set(enabledToolIds);
	return builtins.filter((reg) => allowed.has(reg.toolId));
};

const filterAlwaysDeniedBuiltins = (
	builtins: readonly BuiltinToolRegistration[],
	permission: PermissionConfig | undefined,
): readonly BuiltinToolRegistration[] =>
	builtins.filter((reg) => !isToolAlwaysDenied(permission, reg.toolId));

/**
 * Wrap harness builtins as {@link ToolHandle}[] and apply author allowlist.
 * `enabledToolIds === undefined` → all; `[]` → none.
 * Builtins that are always-deny under {@link permission} are omitted so the
 * model cannot call tools that the gate would refuse without ask.
 */
export const wrapBuiltinToolHandles = (
	harness: Harness,
	enabledToolIds: readonly string[] | undefined,
	permission?: PermissionConfig,
): readonly ToolHandle[] => {
	const filtered = filterAlwaysDeniedBuiltins(
		filterEnabledBuiltins(
			harness.listBuiltinRegistrations(),
			enabledToolIds,
		),
		permission,
	);

	return filtered.map((reg): ToolHandle => ({
		toolId: reg.toolId,
		name: reg.name,
		description: reg.description,
		inputSchema: reg.inputSchema,
		invoke: async (args) => {
			const result = await harness.invoke({
				toolId: reg.toolId,
				args,
			});

			if (!result.ok) {
				throw new Error(result.text);
			}

			return result.text;
		},
	}));
};
