/**
 * Stable inventory ids for MCP tools mapped into the internal tool loop.
 * Shape: `<mcp_name>__<toolName>` where `mcp_name` is the MCP server's
 * `serverInfo.name` (OpenAI-safe `[a-zA-Z0-9_-]` segments).
 *
 * **Owner** of encode/parse for this contract. Consumers:
 * - runtime: this package (MCP clients) + common-nodes MCP handles
 * - common-nodes: `@langflower/tools/mcp-tool-id` (allowed dependency)
 * - shared UI/config: boundary twin at
 *   `packages/shared/src/langflower-config/mcp-tool-id.ts` (tools must not
 *   import shared; shared must not import tools) — kept equal by
 *   `mcp-tool-id.parity.test.ts`
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
