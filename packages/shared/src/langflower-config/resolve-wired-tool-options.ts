import type { InlineSelectOption } from '@langflower/node-sdk';
import type { LangflowerConfig } from '../types/langflower-config.js';
import type {
	WorkflowNodePersisted,
	WorkflowPersistedGraph,
} from '../types/langflower-workflow.js';

const TOOLS_INPUT_PORT = 'tools';

/**
 * Harness builtins for the Inspector — twin of
 * `@langflower/tools` `BUILTIN_TOOL_IDS`. Shared cannot import tools in
 * production; parity is pinned by
 * `packages/tools/src/domain/wired-tool-options.parity.test.ts`.
 */
export const HARNESS_BUILTIN_TOOL_OPTIONS: readonly InlineSelectOption[] = [
	{ value: 'read', title: 'read' },
	{ value: 'glob', title: 'glob' },
	{ value: 'grep', title: 'grep' },
	{ value: 'edit', title: 'edit' },
	{ value: 'write', title: 'write' },
	{ value: 'create', title: 'create' },
	{ value: 'delete', title: 'delete' },
	{ value: 'bash', title: 'bash' },
];

/**
 * Domain pack nodes → tool ids (authoring inspector). Twin of
 * `*_TOOL_CONFIGS` toolId lists in `@langflower/tools/domain-tool-configs`
 * (parity test above).
 */
export const DOMAIN_PACK_TOOL_OPTIONS: Readonly<
	Record<string, readonly InlineSelectOption[]>
> = {
	'common-crawl-tools': [
		{ value: 'crawl_fetch', title: 'crawl_fetch' },
		{ value: 'crawl_extract_links', title: 'crawl_extract_links' },
		{ value: 'crawl_save_page', title: 'crawl_save_page' },
		{ value: 'crawl_bfs', title: 'crawl_bfs' },
	],
	'common-memory-tools': [
		{ value: 'get_memory_tree', title: 'get_memory_tree' },
		{ value: 'read_memory_section', title: 'read_memory_section' },
		{ value: 'search_memory_grep', title: 'search_memory_grep' },
		{ value: 'append_memory_log', title: 'append_memory_log' },
		{ value: 'update_memory_section', title: 'update_memory_section' },
		{ value: 'create_memory_file', title: 'create_memory_file' },
	],
};

const readToolMetaFromNode = (
	node: WorkflowNodePersisted,
): {
	readonly toolId: string;
	readonly name: string;
	readonly description: string;
} | null => {
	const toolId = String(node.inputs.toolId ?? '').trim();

	if (toolId.length === 0) {
		return null;
	}

	const nameRaw = String(node.inputs.name ?? '').trim();
	const description = String(node.inputs.description ?? '').trim();

	return {
		toolId,
		name: nameRaw.length > 0 ? nameRaw : toolId,
		description,
	};
};

const optionsFromSourceNode = (
	node: WorkflowNodePersisted,
): readonly InlineSelectOption[] => {
	const pack = DOMAIN_PACK_TOOL_OPTIONS[node.type];

	if (pack !== undefined) {
		return pack;
	}

	const meta = readToolMetaFromNode(node);

	if (meta === null) {
		return [];
	}

	return [
		{
			value: meta.toolId,
			title: meta.name,
			...(meta.description.length > 0
				? { description: meta.description }
				: {}),
		} satisfies InlineSelectOption,
	];
};

/**
 * Inspector options for `optionsSource: 'node.wiredTools'` — one entry per edge
 * into `tools` / `tools@N`. Domain pack nodes expand to their full tool set.
 */
export const resolveWiredToolOptions = (
	graph: Pick<WorkflowPersistedGraph, 'nodes' | 'edges'>,
	targetNodeId: string,
): readonly InlineSelectOption[] => {
	const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
	const byValue = new Map<string, InlineSelectOption>();

	for (const edge of graph.edges) {
		if (
			edge.toNodeId !== targetNodeId ||
			edge.toPort[0] !== TOOLS_INPUT_PORT
		) {
			continue;
		}

		const node = nodesById.get(edge.fromNodeId);

		if (node === undefined) {
			continue;
		}

		const options = optionsFromSourceNode(node);

		for (const option of options) {
			byValue.set(String(option.value), option);
		}
	}

	return [...byValue.values()];
};

/**
 * Inspector options for system MCP servers from `langflower.jsonc` `mcp.servers`.
 */
export const resolveMcpServerOptions = (
	config: LangflowerConfig,
): readonly InlineSelectOption[] =>
	Object.entries(config.mcp?.servers ?? {}).map(([id, server]) => ({
		value: id,
		title: id,
		description:
			server.kind === 'stdio'
				? `System MCP stdio «${id}»`
				: `System MCP http «${id}»`,
	}));

/**
 * Inspector options for `enabledToolIds`: harness builtins + wired registrations.
 * System MCP uses {@link resolveMcpServerOptions} / Enabled MCP separately.
 */
export const resolveEnabledToolOptions = (
	graph: Pick<WorkflowPersistedGraph, 'nodes' | 'edges'>,
	targetNodeId: string,
): readonly InlineSelectOption[] => {
	const wired = resolveWiredToolOptions(graph, targetNodeId);
	const claimed = new Set(wired.map((option) => String(option.value)));
	const builtins = HARNESS_BUILTIN_TOOL_OPTIONS.filter(
		(option) => !claimed.has(String(option.value)),
	);

	return [...builtins, ...wired];
};

/**
 * Multiselect display value when `enabledToolIds` is unset (= all option ids).
 * Pass the effective allowlist when a role preset resolved one.
 */
export const displayEnabledToolIds = (
	enabledToolIds: unknown,
	allToolIds: readonly string[],
): readonly string[] =>
	Array.isArray(enabledToolIds) ? enabledToolIds.map(String) : allToolIds;

/**
 * Opt-out sync: when the author already chose an explicit allowlist, newly wired
 * tool ids are appended so they start enabled.
 */
export const mergeEnabledToolIdsOnNewWires = (
	enabledToolIds: readonly string[],
	wiredToolIds: readonly string[],
): readonly string[] => {
	const next = new Set(enabledToolIds);
	let changed = false;

	for (const id of wiredToolIds) {
		if (!next.has(id)) {
			next.add(id);
			changed = true;
		}
	}

	return changed ? [...next] : enabledToolIds;
};
