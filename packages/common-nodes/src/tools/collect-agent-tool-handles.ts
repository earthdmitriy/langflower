import type { ToolHandle } from '@langflower/node-sdk';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isToolHandle = (value: unknown): value is ToolHandle => {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value.toolId === 'string' &&
		typeof value.name === 'string' &&
		typeof value.description === 'string' &&
		typeof value.inputSchema === 'object' &&
		value.inputSchema !== null &&
		typeof value.invoke === 'function'
	);
};

/** Flatten multi-wire values that may be single handles or arrays (packs). */
export const flattenToolHandles = (
	wired: readonly unknown[],
): readonly ToolHandle[] =>
	wired.flatMap((item) => {
		if (Array.isArray(item)) {
			return item.filter(isToolHandle);
		}

		if (isToolHandle(item)) {
			return [item];
		}

		return [];
	});

/**
 * Agent inventory: EC ∪ port for tools.
 * No catalog list, no enabledToolIds filter (server already filtered EC).
 * Later `toolHandles` last-wins on `toolId` (jsonc MCP after builtins).
 */
export const collectAgentToolHandles = (options: {
	readonly toolHandles: readonly ToolHandle[] | undefined;
	readonly toolsPort: unknown;
}): readonly ToolHandle[] => {
	const portTools = Array.isArray(options.toolsPort)
		? flattenToolHandles(options.toolsPort as readonly unknown[])
		: flattenToolHandles(
				options.toolsPort === undefined || options.toolsPort === null
					? []
					: [options.toolsPort],
			);

	const byId = new Map<string, ToolHandle>();

	for (const handle of portTools) {
		byId.set(handle.toolId, handle);
	}

	for (const handle of options.toolHandles ?? []) {
		byId.set(handle.toolId, handle);
	}

	return [...byId.values()];
};
