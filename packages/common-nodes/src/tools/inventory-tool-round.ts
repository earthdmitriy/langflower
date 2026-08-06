import type { ToolHandle } from '@langflower/node-sdk';
import {
	isBuiltinToolId,
	type Harness,
} from '@langflower/tools/create-project-harness';
import { formatPermissionDeniedText } from '@langflower/tools/permission';
import type { ToolHandlerContext } from '@langflower/tools/domain-tool-configs';
import type {
	ChatCompletionToolCall,
	ChatCompletionToolDefinition,
} from '../ai/chat-completion-stream.js';
import type {
	SubAgentRegistration,
	SubAgentSpawnPayload,
} from '../ai/sub-agent-protocol.js';

export const SPAWN_SUBAGENT_TOOL = 'spawn_subagent';

const TOOL_LOG_PREVIEW = 400;

export const previewToolLogText = (text: string): string => {
	const trimmed = text.trim();

	if (trimmed.length <= TOOL_LOG_PREVIEW) {
		return trimmed;
	}

	return `${trimmed.slice(0, TOOL_LOG_PREVIEW - 1)}…`;
};

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

/**
 * Invoke an inventory ToolHandle.
 * Builtins: OpenCode-style permission via harness authorize (also gated inside
 * harness.invoke for EC wraps). Wired domain/custom/MCP handles: authoring the
 * edge is consent — no permission.ask.
 */
export const invokeInventoryTool = async (
	harness: Harness | undefined,
	tools: readonly ToolHandle[],
	call: ChatCompletionToolCall,
	toolCtx: ToolHandlerContext | undefined,
	options?: {
		readonly notInAllowlistText?: (toolName: string) => string;
		readonly signal?: AbortSignal;
	},
): Promise<{ readonly ok: boolean; readonly text: string }> => {
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
		const authorize = ctx.authorize ?? harness?.authorize;

		if (authorize === undefined) {
			return {
				ok: false,
				text: `Permission gate unavailable for tool «${toolId}».`,
			};
		}

		const access = await authorize({ toolId, args });

		if (access === 'deny') {
			return {
				ok: false,
				text: formatPermissionDeniedText(toolId, ''),
			};
		}
	}

	try {
		const text = await handle.invoke(args, ctx);
		return { ok: true, text };
	} catch (error) {
		return {
			ok: false,
			text: error instanceof Error ? error.message : String(error),
		};
	}
};

export const buildSpawnSubagentChatTool = (
	registrations: readonly SubAgentRegistration[],
): ChatCompletionToolDefinition => {
	const catalog = registrations
		.map((reg) => {
			const skills =
				reg.skills.length === 0
					? 'none'
					: reg.skills
							.map(
								(skill) =>
									`${skill.skillId}${skill.description.length > 0 ? ` (${skill.description})` : ''}`,
							)
							.join(', ');

			return `- nodeId=${reg.targetNodeId} name=${reg.name}: ${reg.description} skills=[${skills}]`;
		})
		.join('\n');

	return {
		type: 'function',
		function: {
			name: SPAWN_SUBAGENT_TOOL,
			description: [
				'Spawn one Sub-Agent on the canvas (sequential — wait for its result before another spawn).',
				'Pick nodeId from the catalog. skillId may be empty if unused.',
				'Catalog:',
				catalog.length > 0 ? catalog : '(no Sub-Agents registered)',
			].join('\n'),
			parameters: {
				type: 'object',
				properties: {
					nodeId: {
						type: 'string',
						description: 'targetNodeId of the Sub-Agent to spawn',
					},
					skillId: {
						type: 'string',
						description:
							'Optional skill id announced by that Sub-Agent; empty if none',
					},
					task: {
						type: 'string',
						description: 'Task text for the Sub-Agent body',
					},
				},
				required: ['nodeId', 'task'],
			},
		},
	};
};

export const resolveSpawnPayload = (
	call: ChatCompletionToolCall,
	registrations: readonly SubAgentRegistration[],
	openCallId: string | undefined,
):
	| { readonly ok: true; readonly payload: SubAgentSpawnPayload }
	| { readonly ok: false; readonly text: string } => {
	if (openCallId !== undefined) {
		return {
			ok: false,
			text: `Serial spawn only: already waiting for callId=${openCallId}.`,
		};
	}

	const args = parseToolArgs(call.arguments);
	const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : '';
	const task = typeof args.task === 'string' ? args.task : '';
	const skillId = typeof args.skillId === 'string' ? args.skillId.trim() : '';

	if (nodeId.length === 0) {
		return { ok: false, text: 'spawn_subagent requires nodeId.' };
	}

	if (task.trim().length === 0) {
		return { ok: false, text: 'spawn_subagent requires a non-empty task.' };
	}

	const target = registrations.find((reg) => reg.targetNodeId === nodeId);

	if (target === undefined) {
		return {
			ok: false,
			text: `Unknown Sub-Agent nodeId «${nodeId}» (not in subagentRegistration).`,
		};
	}

	if (
		skillId.length > 0 &&
		!target.skills.some((skill) => skill.skillId === skillId)
	) {
		return {
			ok: false,
			text: `Skill «${skillId}» is not announced by Sub-Agent «${nodeId}».`,
		};
	}

	return {
		ok: true,
		payload: {
			callId: call.id,
			nodeId,
			skillId,
			task,
		},
	};
};
