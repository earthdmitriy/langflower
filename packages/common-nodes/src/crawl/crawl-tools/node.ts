import { defineToolRegistrations } from '@langflower/node-sdk';
import { CRAWL_TOOL_CONFIGS } from '@langflower/tools/domain-tool-configs';

/**
 * Emits Crawl ToolHandles. Invokers come from `@langflower/tools`; no harness
 * tool-id registry participates in agent inventory.
 */
export const crawlToolsNode = defineToolRegistrations({
	type: 'common-crawl-tools',
	displayName: 'Crawl Tools',
	category: 'Tools',
	description:
		'Emits crawl_fetch / crawl_extract_links / crawl_save_page / crawl_bfs with imported handlers for agent inventory.',
	tools: CRAWL_TOOL_CONFIGS,
});
