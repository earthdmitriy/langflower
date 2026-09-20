import type { ToolHandle } from '@langflower/node-sdk';
import { isBuiltinToolId } from '@langflower/tools/create-project-harness';
import { formatPermissionDeniedText } from '@langflower/tools/permission';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import type {
	ChatCompletionToolCall,
	ChatCompletionToolDefinition,
} from '../chat-completion-stream.js';

export const toChatToolDefinitions = (
	tools: readonly ToolHandle[],
): readonly ChatCompletionToolDefinition[] =>
	tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.toolId.length > 0 ? tool.toolId : tool.name,
			description: tool.description,
			parameters: tool.inputSchema,
		},
	}));

export const parseToolArgs = (
	raw: string,
): Readonly<Record<string, unknown>> => {
	if (raw.trim().length === 0) {
		return {};
	}

	try {
		const parsed: unknown = JSON.parse(raw);

		if (
			parsed !== null &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed)
		) {
			return parsed as Readonly<Record<string, unknown>>;
		}

		return { value: parsed };
	} catch {
		return { __raw: raw };
	}
};

const findToolHandle = (
	tools: readonly ToolHandle[],
	toolId: string,
): ToolHandle | undefined =>
	tools.find(
		(tool) =>
			tool.toolId === toolId ||
			(tool.toolId.length === 0 && tool.name === toolId),
	);

export type InventoryToolResult = {
	readonly ok: boolean;
	readonly text: string;
};

export type PreparedInventoryInvoke = {
	readonly handle: ToolHandle;
	readonly args: Readonly<Record<string, unknown>>;
	readonly ctx: ToolHandlerContext;
};

export type PrepareInventoryToolResult =
	| { readonly ok: false; readonly text: string }
	| { readonly ok: true; readonly invoke: PreparedInventoryInvoke };

/**
 * Resolve the handle and run builtin `authorize` (permission.ask).
 * Does not invoke the tool body — callers may timeout only the body.
 */
export const prepareInventoryTool = async (
	tools: readonly ToolHandle[],
	call: ChatCompletionToolCall,
	toolCtx: ToolHandlerContext | undefined,
	options?: {
		readonly notInAllowlistText?: (toolName: string) => string;
		readonly signal?: AbortSignal;
	},
): Promise<PrepareInventoryToolResult> => {
	const handle = findToolHandle(tools, call.name);

	if (handle === undefined) {
		const notInAllowlistText =
			options?.notInAllowlistText ??
			((toolName) =>
				`Tool «${toolName}» is not in the enabled allowlist.`);

		return {
			ok: false,
			text: notInAllowlistText(call.name),
		};
	}

	if (toolCtx === undefined) {
		return {
			ok: false,
			text: 'No tool handler context available to invoke tools.',
		};
	}

	const args = parseToolArgs(call.arguments);
	const toolId = handle.toolId.length > 0 ? handle.toolId : handle.name;
	const ctx: ToolHandlerContext =
		options?.signal === undefined
			? toolCtx
			: { ...toolCtx, signal: options.signal };

	if (isBuiltinToolId(toolId)) {
		const authorize = ctx.authorize;

		if (authorize === undefined) {
			return {
				ok: false,
				text: `Permission gate unavailable for tool «${toolId}».`,
			};
		}

		const access = await authorize({
			toolId,
			args,
			...(options?.signal !== undefined
				? { signal: options.signal }
				: {}),
		});

		if (access === 'deny') {
			return {
				ok: false,
				text: formatPermissionDeniedText(toolId, ''),
			};
		}
	}

	return { ok: true, invoke: { handle, args, ctx } };
};

export const invokePreparedInventoryTool = async (
	prepared: PreparedInventoryInvoke,
): Promise<InventoryToolResult> => {
	try {
		const text = await prepared.handle.invoke(prepared.args, prepared.ctx);
		return { ok: true, text };
	} catch (error) {
		return {
			ok: false,
			text: error instanceof Error ? error.message : String(error),
		};
	}
};

/**
 * Invoke an inventory ToolHandle.
 * Builtins: OpenCode-style permission via `toolCtx.authorize` (also gated
 * inside harness.invoke for EC wraps). Wired domain/custom/MCP handles:
 * authoring the edge is consent — no permission.ask.
 */
export const invokeInventoryTool = async (
	tools: readonly ToolHandle[],
	call: ChatCompletionToolCall,
	toolCtx: ToolHandlerContext | undefined,
	options?: {
		readonly notInAllowlistText?: (toolName: string) => string;
		readonly signal?: AbortSignal;
	},
): Promise<InventoryToolResult> => {
	const prepared = await prepareInventoryTool(tools, call, toolCtx, options);
	if (!prepared.ok) {
		return prepared;
	}

	return invokePreparedInventoryTool(prepared.invoke);
};
