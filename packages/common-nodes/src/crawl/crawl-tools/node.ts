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
	description: `
Give an agent fetch, extract-links, save-page, and crawl tools.

Wire **tools** into an LLM so it can research the web from chat.
`.trim(),
	tools: CRAWL_TOOL_CONFIGS,
});
