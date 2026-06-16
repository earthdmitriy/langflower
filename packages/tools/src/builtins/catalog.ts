import { bashTool } from './bash/tool.js';
import { createTool } from './create/tool.js';
import { deleteTool } from './delete/tool.js';
import { editTool } from './edit/tool.js';
import { globTool } from './glob/tool.js';
import { grepTool } from './grep/tool.js';
import { readTool } from './read/tool.js';
import type { BuiltinToolRegistration, HandlerContext } from './types.js';
import { writeTool } from './write/tool.js';

/** Composer: builtin order for inventory + invoke dispatch. */
export const BUILTIN_TOOLS = [
	readTool,
	globTool,
	grepTool,
	editTool,
	writeTool,
	createTool,
	deleteTool,
	bashTool,
] as const;

export type BuiltinToolId = (typeof BUILTIN_TOOLS)[number]['id'];

export const BUILTIN_TOOL_IDS: readonly BuiltinToolId[] = BUILTIN_TOOLS.map(
	(tool) => tool.id,
);

export const BUILTIN_REGISTRATIONS: readonly BuiltinToolRegistration[] =
	BUILTIN_TOOLS.map((tool) => tool.registration);

const byId: Readonly<Record<BuiltinToolId, (typeof BUILTIN_TOOLS)[number]>> =
	Object.fromEntries(BUILTIN_TOOLS.map((tool) => [tool.id, tool])) as Record<
		BuiltinToolId,
		(typeof BUILTIN_TOOLS)[number]
	>;

export const isBuiltinToolId = (toolId: string): toolId is BuiltinToolId =>
	Object.hasOwn(byId, toolId);

export const invokeBuiltin = (
	toolId: BuiltinToolId,
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => byId[toolId].invoke(ctx, args);

export type { BuiltinToolRegistration, HandlerContext };
