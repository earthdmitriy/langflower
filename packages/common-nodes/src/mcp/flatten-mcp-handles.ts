import type { McpHandle } from '@langflower/node-sdk/mcp';

const isMcpHandle = (value: unknown): value is McpHandle =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as McpHandle).id === 'string' &&
	Array.isArray((value as McpHandle).tools);

/**
 * Flatten multi-wire `mcp` combine values (single handle, arrays, or nested
 * arrays from defaultValue `[]` on a multi port).
 */
export const flattenMcpHandles = (wired: unknown): readonly McpHandle[] => {
	const root = wired ?? [];
	const list = Array.isArray(root) ? root : [root];

	return list.flatMap((item) => {
		if (Array.isArray(item)) {
			return item.filter(isMcpHandle);
		}

		if (isMcpHandle(item)) {
			return [item];
		}

		return [];
	});
};
