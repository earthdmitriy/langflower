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
	description:
		'Emits get_memory_tree / read_memory_section / search_memory_grep / append_memory_log / update_memory_section / create_memory_file for agent inventory.',
	tools: MEMORY_TOOL_CONFIGS,
});
