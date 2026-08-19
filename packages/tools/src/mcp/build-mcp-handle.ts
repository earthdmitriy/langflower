import type { ToolHandle } from '@langflower/node-sdk';
import { encodeMcpToolId } from './mcp-tool-id.js';
import type { McpClient } from './mcp-client-types.js';

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
 * After connect: list tools once and bind invoke closures.
 * Optional `toolNamesRaw` filters for system MCP jsonc; canvas nodes omit it
 * and expose the full `tools/list` inventory. Tool ids use `client.serverName`
 * (`<mcp_name>__<tool>`).
 */
export const buildMcpHandle = async (options: {
	readonly toolNamesRaw?: unknown;
	readonly client: McpClient;
}): Promise<readonly ToolHandle[]> => {
	const mcpName = options.client.serverName.trim();

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

	return listed.flatMap((tool) => {
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
};
