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
 * Flatten a tools wire (single handle, pack, or `multi: 'combine'` array)
 * and last-wins on `toolId`.
 */
export const lastWinsToolHandles = (wired: unknown): readonly ToolHandle[] => {
	const flattened = Array.isArray(wired)
		? flattenToolHandles(wired)
		: flattenToolHandles(
				wired === undefined || wired === null ? [] : [wired],
			);
	const byId = new Map<string, ToolHandle>();
	for (const handle of flattened) {
		byId.set(handle.toolId, handle);
	}

	return [...byId.values()];
};

/**
 * Agent inventory: EC ∪ port for tools.
 * No catalog list, no inventory allowlist filter (server already filtered EC).
 * Later `toolHandles` last-wins on `toolId` (jsonc MCP after builtins).
 */
export const collectAgentToolHandles = (options: {
	readonly toolHandles: readonly ToolHandle[] | undefined;
	readonly toolsPort: unknown;
}): readonly ToolHandle[] => {
	const byId = new Map<string, ToolHandle>();

	for (const handle of lastWinsToolHandles(options.toolsPort)) {
		byId.set(handle.toolId, handle);
	}

	for (const handle of options.toolHandles ?? []) {
		byId.set(handle.toolId, handle);
	}

	return [...byId.values()];
};
