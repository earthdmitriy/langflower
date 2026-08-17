import type { ToolHandle } from '../define-tool-registrations/tool-handle.js';

/**
 * Live MCP session handle owned by MCP stdio/http nodes and server project
 * MCP seed. Agents consume `tools` only — not a canvas wire type.
 * Not JSON-serializable.
 */
export type McpHandle = {
	/** Wire: graph nodeId. System: jsonc `mcp.servers` key. */
	readonly id: string;
	/** MCP `serverInfo.name` from initialize (not author-supplied). */
	readonly name: string;
	/** Tools listed+bound at connect (`tools/list`; system MCP may filter). */
	readonly tools: readonly ToolHandle[];
};
