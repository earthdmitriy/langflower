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
 * production ([ADR-039](../../../docs/adr/039-dag-forced-twins-stay-copies-until-the-dag-flips.md));
 * parity is pinned by
 * `packages/tools/src/domain/wired-tool-options.parity.test.ts`.
 */
export const HARNESS_BUILTIN_TOOL_OPTIONS: readonly InlineSelectOption[] = [
	{
		value: 'read',
		title: 'read',
		description:
			'Read a file under the project root. Optional startLine/endLine (1-based) or offset/limit (byte-ish line slices). Optional postProcess: source of (res: string) => string. png, jpg, jpeg, gif, webp, wav, mp3, and pdf are staged as session uploads; the result is one line with the path, MIME, and size. Other files, including video, stay UTF-8 text.',
	},
	{
		value: 'glob',
		title: 'glob',
		description:
			'List files matching a glob under the project root (gitignore-aware by default). Optional postProcess.',
	},
	{
		value: 'grep',
		title: 'grep',
		description:
			'Regex search across project files (gitignore-aware by default; ripgrep when available, else grep, else bounded Node walk). Optional postProcess.',
	},
	{
		value: 'edit',
		title: 'edit',
		description:
			'Exact string replace in a file. Fails if oldString is missing or not unique.',
	},
	{
		value: 'write',
		title: 'write',
		description:
			'Write or overwrite a file (creates parent directories). Prefer create for new-only files.',
	},
	{
		value: 'create',
		title: 'create',
		description:
			'Create a new file. Fails if the path already exists (use write to overwrite).',
	},
	{
		value: 'delete',
		title: 'delete',
		description: 'Delete a file under the project root.',
	},
	{
		value: 'move',
		title: 'move',
		description:
			'Move or rename a file or directory under the project root. Fails if the destination exists (delete or rename it first). Prefer this over bash mv/ren/Move-Item. Both from and to must be the full path (not a parent directory).',
	},
	{
		value: 'sleep',
		title: 'sleep',
		description:
			'Wait a bounded number of seconds (1–300) without bash. Stop aborts the wait. Not a job-wait and not canvas Delay.',
	},
	{
		value: 'bash',
		title: 'bash',
		description:
			'Run a shell command in the project root. Disabled unless the harness enables bash (default-deny). Not read-class — no postProcess.',
	},
	{
		value: 'ask_user',
		title: 'ask_user',
		description:
			'Do not guess. If you are not sure, ask the user. Pauses the run so the operator can answer. Pass «question» for a freeform prompt, and/or ordered «questions» with optional choice lists. The operator sees every question at once, may select options (multi-select when allowMultiple is true), and may also type a freeform reply. One Send returns the answers.',
	},
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
		{
			value: 'crawl_fetch',
			title: 'crawl_fetch',
			description:
				'HTTP GET a URL via SSRF-guarded fetch; returns status, title, and plain text.',
		},
		{
			value: 'crawl_extract_links',
			title: 'crawl_extract_links',
			description:
				'Extract absolute href links from HTML for a base URL.',
		},
		{
			value: 'crawl_save_page',
			title: 'crawl_save_page',
			description:
				'Persist a crawled page under .langflower/crawl/{runId}/.',
		},
		{
			value: 'crawl_bfs',
			title: 'crawl_bfs',
			description:
				'Breadth-first crawl from a start URL (same-host by default); optionally saves pages.',
		},
	],
	'common-memory-tools': [
		{
			value: 'get_memory_tree',
			title: 'get_memory_tree',
			description:
				'Returns the structure of the memory directory including file names and their top-level Markdown headings to understand where information is stored.',
		},
		{
			value: 'read_memory_section',
			title: 'read_memory_section',
			description:
				'Reads the content of a memory file. Can optionally target a specific Markdown heading section.',
		},
		{
			value: 'search_memory_grep',
			title: 'search_memory_grep',
			description:
				'Performs a fast, deterministic regex/keyword search across all files in the memory directory. Returns matching lines with file paths.',
		},
		{
			value: 'append_memory_log',
			title: 'append_memory_log',
			description:
				'Appends a new text entry or bullet point strictly to the end of a memory file. Use this for logging events, history, or chronological notes.',
		},
		{
			value: 'update_memory_section',
			title: 'update_memory_section',
			description:
				'Updates or creates a specific Markdown heading section with new content. Replaces the old section content entirely. Keeps the rest of the file untouched.',
		},
		{
			value: 'create_memory_file',
			title: 'create_memory_file',
			description:
				'Creates a new empty memory file or initializes it with basic top-level structure. Fails if the file already exists.',
		},
		{
			value: 'update_plan',
			title: 'update_plan',
			description:
				'Replace the current plan shown to the operator in the work log. Writes the reserved ## Plan section in history/plan.md. There is no separate Plan mode — call this whenever the live plan changes. Pass only the markdown body under the heading (Goal, Context, Steps, Risks, Open questions).',
		},
		{
			value: 'read_plan',
			title: 'read_plan',
			description:
				'Reads the current operator-visible plan from history/plan.md (## Plan). Returns empty content when the plan file or section does not exist.',
		},
	],
	'common-langflower-tools': [
		{
			value: 'compile_custom_nodes',
			title: 'compile_custom_nodes',
			description:
				'Recompile `.langflower/nodes/` packs, hot-swap live custom instances, and refresh the Custom palette (same intent as Custom → Update). After writing `.ts`, hashes miss and compile without force. Pass force to rebuild even when hashes match.',
		},
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
 * Inspector options for harness builtins + wired registrations
 * (`tool-permission-table` / `node.wiredTools`).
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
