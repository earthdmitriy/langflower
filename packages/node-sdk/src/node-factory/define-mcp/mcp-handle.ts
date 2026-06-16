import type { ToolHandle } from '../define-tool-registrations/tool-handle.js';

/**
 * Live MCP session handle on LLM `mcp` init ports.
 * Owned by MCP stdio/http nodes and server project MCP seed — agents only
 * flatten `tools`. Not JSON-serializable.
 */
export type McpHandle = {
	/** Wire: graph nodeId. System: jsonc `mcp.servers` key. */
	readonly id: string;
	/** MCP `serverInfo.name` from initialize (not author-supplied). */
	readonly name: string;
	/** Tools listed+bound at connect (`tools/list`; system MCP may filter). */
	readonly tools: readonly ToolHandle[];
};

export const MCP_HANDLE_WIRE_TYPE = 'mcp-handle';
