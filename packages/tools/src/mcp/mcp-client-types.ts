/** Shared MCP client surface for stdio and HTTP transports. */
export type McpListedTool = {
	readonly name: string;
	readonly description?: string;
	readonly inputSchema?: object;
};

export type McpCallResult = {
	readonly ok: boolean;
	readonly text: string;
};

export type McpClient = {
	/** Non-empty name from MCP `initialize` `serverInfo.name`. */
	readonly serverName: string;
	readonly listTools: () => Promise<readonly McpListedTool[]>;
	readonly callTool: (
		name: string,
		args: Readonly<Record<string, unknown>>,
	) => Promise<McpCallResult>;
	readonly close: () => Promise<void>;
};
