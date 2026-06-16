import { encodeMcpToolId } from './mcp-tool-id.js';
import type { McpClient } from './mcp-client-types.js';

/**
 * Structural twin of node-sdk `ToolHandle` (tools must not import
 * `@langflower/node-sdk`). Assignable at call sites that expect the
 * author-facing handle.
 */
export type BuiltMcpToolHandle = {
	readonly toolId: string;
	readonly name: string;
	readonly description: string;
	readonly inputSchema: object;
	readonly invoke: (
		args: Readonly<Record<string, unknown>>,
	) => Promise<string>;
};

/** Structural twin of node-sdk `McpHandle`. */
export type BuiltMcpHandle = {
	readonly id: string;
	readonly name: string;
	readonly tools: readonly BuiltMcpToolHandle[];
};

const parseToolNames = (raw: unknown): readonly string[] => {
	if (typeof raw !== 'string') {
		return [];
	}

	return raw
		.split(/[,\s]+/)
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
};

/**
 * After connect: list tools once and build a live MCP handle with eager tools.
 * Optional `toolNamesRaw` filters for system MCP jsonc; canvas nodes omit it
 * and expose the full `tools/list` inventory. Tool ids use `client.serverName`
 * (`<mcp_name>__<tool>`).
 */
export const buildMcpHandle = async (options: {
	readonly id: string;
	readonly toolNamesRaw?: unknown;
	readonly client: McpClient;
}): Promise<BuiltMcpHandle> => {
	const id = options.id.trim();
	const mcpName = options.client.serverName.trim();

	if (id.length === 0) {
		throw new Error('MCP handle id is empty.');
	}

	if (mcpName.length === 0) {
		throw new Error('MCP client.serverName is empty.');
	}

	const toolNames = parseToolNames(options.toolNamesRaw);
	const listed = await options.client.listTools();

	const allowedIds =
		toolNames.length === 0
			? undefined
			: new Set(
					toolNames
						.map((toolName) => encodeMcpToolId(mcpName, toolName))
						.filter((toolId) => toolId.length > 0),
				);

	const tools: readonly BuiltMcpToolHandle[] = listed.flatMap((tool) => {
		const toolId = encodeMcpToolId(mcpName, tool.name);

		if (toolId.length === 0) {
			return [];
		}

		if (allowedIds !== undefined && !allowedIds.has(toolId)) {
			return [];
		}

		const description =
			(tool.description ?? '').trim().length > 0
				? `${tool.description} (MCP:${mcpName})`
				: `MCP tool «${tool.name}» from server «${mcpName}»`;

		return [
			{
				toolId,
				name: toolId,
				description,
				inputSchema:
					tool.inputSchema !== undefined &&
					typeof tool.inputSchema === 'object'
						? tool.inputSchema
						: { type: 'object', properties: {} },
				invoke: async (args) => {
					const result = await options.client.callTool(
						tool.name,
						args,
					);
					return result.text;
				},
			},
		];
	});

	return {
		id,
		name: mcpName,
		tools,
	};
};
