import { defineToolRegistrations } from '@langflower/node-sdk';
import { MEMORY_TOOL_CONFIGS } from '@langflower/tools/domain-tool-configs';

/**
 * Emits Memory ToolHandles for `.langflower/memory/` markdown tools.
 * Invokers come from `@langflower/tools`; no harness tool-id registry.
 */
export const memoryToolsNode = defineToolRegistrations({
	type: 'common-memory-tools',
	displayName: 'Memory Tools',
	category: 'Tools',
	description: `
Give an agent tools to read and write the project wiki (tree, search, append, update, create).

Wire **tools** into an LLM. Notes live under the project's memory folder.
`.trim(),
	tools: MEMORY_TOOL_CONFIGS,
});
