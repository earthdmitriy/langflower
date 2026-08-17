import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import { fakeLlmNode } from './ai/nodes/fake-llm/node.js';
import { openAiLlmNode } from './ai/nodes/openai-llm/node.js';
import { mcpHttpNode } from './mcp/mcp-http/node.js';
import { mcpStdioNode } from './mcp/mcp-stdio/node.js';
import { chatInputNode } from './hitl/chat-input/node.js';
import { reviewNode } from './ai/nodes/review/node.js';
import { critiqueNode } from './ai/nodes/critique/node.js';
import { subAgentNode } from './ai/nodes/sub-agent/node.js';
import { checkpointNode } from './flow/checkpoint/node.js';
import { delayNode } from './flow/delay/node.js';
import { loopNode } from './flow/loop/node.js';
import { mergeNode } from './flow/merge/node.js';
import { repeatNode } from './flow/repeat/node.js';
import { routerNode } from './flow/router/node.js';
import { hitlReviewGateNode } from './hitl/review-gate/node.js';
import { assertNode } from './logic/assert/node.js';
import { compareNode } from './logic/compare/node.js';
import { gateNode } from './logic/gate/node.js';
import { ifNode } from './logic/if/node.js';
import { switchNode } from './logic/switch/node.js';
import { finishNode } from './output/finish/node.js';
import { previewNode } from './output/preview/node.js';
import { booleanNode } from './primitives/boolean/node.js';
import { numberNode } from './primitives/number/node.js';
import { stringNode } from './primitives/string/node.js';
import { appendFileNode } from './text/append-file/node.js';
import { concatNode } from './text/concat/node.js';
import { readFileNode } from './text/read-file/node.js';
import { writeFileNode } from './text/write-file/node.js';
import { crawlNode } from './crawl/crawl/node.js';
import { crawlToolsNode } from './crawl/crawl-tools/node.js';
import { extractLinksNode } from './crawl/extract-links/node.js';
import { fetchUrlNode } from './crawl/fetch-url/node.js';
import { savePageNode } from './crawl/save-page/node.js';
import { memoryToolsNode } from './memory/memory-tools/node.js';
import { langflowerToolsNode } from './langflower-tools/node.js';
import { toolCollectionNode } from './tools/tool-collection/node.js';

const COMMON_REACTIVE_NODES = [
	booleanNode,
	numberNode,
	stringNode,
	mergeNode,
	delayNode,
	checkpointNode,
	loopNode,
	repeatNode,
	routerNode,
	previewNode,
	finishNode,
	concatNode,
	readFileNode,
	writeFileNode,
	appendFileNode,
	hitlReviewGateNode,
	chatInputNode,
	fakeLlmNode,
	openAiLlmNode,
	mcpStdioNode,
	mcpHttpNode,
	reviewNode,
	critiqueNode,
	subAgentNode,
	assertNode,
	ifNode,
	gateNode,
	compareNode,
	switchNode,
	memoryToolsNode,
	langflowerToolsNode,
	toolCollectionNode,
	fetchUrlNode,
	extractLinksNode,
	savePageNode,
	crawlNode,
	crawlToolsNode,
] as const;

export type CommonReactiveNodeCatalog = Record<string, ReactiveNodeDefinition>;

const COMMON_REACTIVE_NODE_CATALOG: CommonReactiveNodeCatalog =
	Object.fromEntries(
		COMMON_REACTIVE_NODES.map((node) => [node.type, node]),
	) as unknown as CommonReactiveNodeCatalog;

export function getCommonReactiveNodeCatalog(): CommonReactiveNodeCatalog {
	return COMMON_REACTIVE_NODE_CATALOG;
}

export function getCommonReactiveNode(
	type: string,
): ReactiveNodeDefinition | undefined {
	return COMMON_REACTIVE_NODE_CATALOG[type];
}

export {
	COMMON_ROUTER_TYPE,
	DEFAULT_ROUTER_CHANNELS,
} from './flow/router/router-constants.js';
export {
	resolveWorkflowNodeDefinition,
	type ResolveWorkflowNodeInstance,
} from './resolve-workflow-node-definition.js';
