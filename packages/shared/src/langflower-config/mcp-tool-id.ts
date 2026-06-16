/**
 * Stable inventory ids for MCP tools mapped into the internal tool loop.
 * Shape: `<mcp_name>__<toolName>` where `mcp_name` is the MCP server's
 * `serverInfo.name` (OpenAI-safe `[a-zA-Z0-9_-]` segments).
 *
 * **Boundary twin** of the owner implementation in
 * `@langflower/tools/mcp-tool-id` (`packages/tools/src/mcp/mcp-tool-id.ts`).
 * Shared must not import tools; tools must not import shared. Parity is pinned
 * by `packages/tools/src/mcp/mcp-tool-id.parity.test.ts` — change both (or
 * update the owner first, then mirror here).
 */

const SERVER_ID_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/;

const sanitizeMcpSegment = (raw: string): string =>
	raw
		.trim()
		.replace(/[^a-zA-Z0-9_-]+/g, '_')
		.replace(/^_+|_+$/g, '');

/** Jsonc / Inspector map key for system MCP (`mcp.servers.<id>`). */
export const isValidMcpServerId = (serverId: string): boolean =>
	SERVER_ID_RE.test(serverId);

/**
 * Encode inventory tool id from MCP server name + tool name.
 * @param mcpName - `serverInfo.name` from initialize (not config/node id)
 */
export const encodeMcpToolId = (mcpName: string, toolName: string): string => {
	const server = sanitizeMcpSegment(mcpName);
	const tool = sanitizeMcpSegment(toolName);

	if (server.length === 0 || tool.length === 0) {
		return '';
	}

	return `${server}__${tool}`;
};

export const parseMcpToolId = (
	toolId: string,
): { readonly serverId: string; readonly toolName: string } | null => {
	const match = /^([a-zA-Z0-9_-]+)__(.+)$/.exec(toolId.trim());

	if (match === null) {
		return null;
	}

	const serverId = match[1] ?? '';
	const toolName = match[2] ?? '';

	if (serverId.length === 0 || toolName.length === 0) {
		return null;
	}

	return { serverId, toolName };
};

export const isMcpToolId = (toolId: string): boolean =>
	parseMcpToolId(toolId) !== null;
