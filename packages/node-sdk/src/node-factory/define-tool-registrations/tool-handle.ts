/**
 * Identity passed to {@link ToolHandle.invoke} / domain handlers.
 * Host hooks (authorize, webFetch, path/host policy) are **not**
 * part of the author SDK — they live on the tools/runtime bag assembled by
 * the agent shell (`@langflower/tools` `ToolHandlerContext`).
 */
export type ToolHandlerContext = {
	readonly projectDir: string;
	readonly runId: string;
};

export type ToolHandler = (
	args: Readonly<Record<string, unknown>>,
	ctx: ToolHandlerContext,
) => Promise<string>;

/**
 * Atomic tool for the agent: meta for the model + invoke.
 * Payload on `tool-handle` wires into LLM / Review `tools` ports.
 */
export type ToolHandle = {
	readonly toolId: string;
	readonly name: string;
	readonly description: string;
	readonly inputSchema: object;
	readonly invoke: ToolHandler;
};

export const TOOL_HANDLE_WIRE_TYPE = 'tool-handle';
