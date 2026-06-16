/** MCP tool names: `[a-zA-Z0-9_-]` — map bus dots to underscores. */
export const sanitizeToolName = (intent: string): string =>
	intent.replace(/\./g, '_');
