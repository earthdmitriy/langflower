import { createCrawlContext } from '../create-crawl-context.js';
import { createMemoryStore } from '../memory/create-memory-store.js';
import { createWebFetch } from '../create-web-fetch.js';
import type { WebFetchRequest, WebFetchResult } from '../create-web-fetch.js';
import { asNumber, asString, requireString } from './args.js';
import { extractHtmlTitle, extractLinks, htmlToText } from './html.js';
import { runBfsCrawl } from './run-bfs-crawl.js';

/**
 * Invoke-time context for domain tool handlers.
 * Extends the SDK identity `{ projectDir, runId }` with optional host hooks
 * (authorize / fetch / path policy) supplied by the agent shell —
 * not part of the author `@langflower/node-sdk` surface.
 */
export type ToolHandlerContext = {
	readonly projectDir: string;
	readonly runId: string;
	readonly authorize?: (call: {
		readonly toolId: string;
		readonly args: Readonly<Record<string, unknown>>;
	}) => Promise<'allow' | 'deny'>;
	readonly webFetch?: (request: WebFetchRequest) => Promise<WebFetchResult>;
	readonly denyPaths?: readonly string[];
	readonly allowedHosts?: readonly string[];
};

export type ToolHandler = (
	args: Readonly<Record<string, unknown>>,
	ctx: ToolHandlerContext,
) => Promise<string>;

export type DomainToolConfig = {
	readonly toolId: string;
	readonly name?: string;
	readonly description: string;
	readonly inputSchema: object;
	readonly handler: ToolHandler;
};

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const requireWebFetch = (
	ctx: ToolHandlerContext,
): ((request: WebFetchRequest) => Promise<WebFetchResult>) =>
	ctx.webFetch ??
	createWebFetch({
		...(ctx.allowedHosts !== undefined
			? { allowedHosts: ctx.allowedHosts }
			: {}),
	});

const fetchPage = async (
	webFetch: (request: WebFetchRequest) => Promise<WebFetchResult>,
	url: string,
	timeoutMs?: number,
	maxBytes?: number,
): Promise<{
	readonly url: string;
	readonly html: string;
	readonly text: string;
	readonly title?: string;
	readonly status: number;
}> => {
	const result = await webFetch({
		url,
		...(timeoutMs !== undefined ? { timeoutMs } : {}),
		...(maxBytes !== undefined ? { maxBytes } : {}),
	});

	if (!result.ok) {
		throw new Error(
			result.error ??
				`Fetch failed for ${url} (status ${result.status}).`,
		);
	}

	const text = htmlToText(result.body);
	const title = extractHtmlTitle(result.body);

	return {
		url: result.url,
		html: result.body,
		text,
		...(title !== undefined ? { title } : {}),
		status: result.status,
	};
};

export const CRAWL_TOOL_CONFIGS: readonly DomainToolConfig[] = [
	{
		toolId: 'crawl_fetch',
		description:
			'HTTP GET a URL via SSRF-guarded fetch; returns status, title, and plain text.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'Absolute http(s) URL' },
				timeoutMs: { type: 'number' },
				maxBytes: { type: 'number' },
			},
			required: ['url'],
		},
		handler: async (args, ctx) => {
			const page = await fetchPage(
				requireWebFetch(ctx),
				requireString(args, 'url'),
				asNumber(args, 'timeoutMs'),
				asNumber(args, 'maxBytes'),
			);

			return json({
				url: page.url,
				status: page.status,
				title: page.title ?? null,
				text: page.text,
				htmlChars: page.html.length,
			});
		},
	},
	{
		toolId: 'crawl_extract_links',
		description: 'Extract absolute href links from HTML for a base URL.',
		inputSchema: {
			type: 'object',
			properties: {
				html: { type: 'string' },
				baseUrl: { type: 'string' },
			},
			required: ['html', 'baseUrl'],
		},
		handler: async (args) => {
			const html = requireString(args, 'html');
			const baseUrl = requireString(args, 'baseUrl');
			const links = extractLinks(html, baseUrl);

			return json({ count: links.length, links });
		},
	},
	{
		toolId: 'crawl_save_page',
		description: 'Persist a crawled page under .langflower/crawl/{runId}/.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				html: { type: 'string' },
				text: { type: 'string' },
				title: { type: 'string' },
			},
			required: ['url'],
		},
		handler: async (args, ctx) => {
			const url = requireString(args, 'url');
			const html = asString(args, 'html') ?? '';
			const text = asString(args, 'text') ?? htmlToText(html);
			const title = asString(args, 'title');
			const saved = await createCrawlContext(
				ctx.projectDir,
				ctx.runId,
			).savePage({
				url,
				html,
				text,
				...(title !== undefined && title.length > 0 ? { title } : {}),
			});

			return json(saved);
		},
	},
	{
		toolId: 'crawl_bfs',
		description:
			'Breadth-first crawl from a start URL (same-host by default); optionally saves pages.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				maxPages: { type: 'number', description: '1–50; default 5' },
				maxDepth: {
					type: 'number',
					description:
						'Optional link-expansion depth cap (0 = seed only). Omit for unlimited (default).',
				},
				sameHostOnly: { type: 'boolean', default: true },
				save: { type: 'boolean', default: true },
			},
			required: ['url'],
		},
		handler: async (args, ctx) => {
			const webFetch = requireWebFetch(ctx);
			const crawl = createCrawlContext(ctx.projectDir, ctx.runId);
			const startUrl = requireString(args, 'url');
			const maxPages = Math.min(
				Math.max(1, Math.floor(asNumber(args, 'maxPages') ?? 5)),
				50,
			);
			const maxDepthRaw = asNumber(args, 'maxDepth');
			const maxDepth =
				maxDepthRaw === undefined
					? undefined
					: Math.min(Math.max(0, Math.floor(maxDepthRaw)), 5);
			const sameHostOnly = args.sameHostOnly !== false;
			const save = args.save !== false;
			const crawled = await runBfsCrawl({
				startUrl,
				maxPages,
				sameHostOnly,
				failureMode: 'record',
				enqueueBudget: 'unlimited',
				webFetch,
				...(maxDepth !== undefined ? { maxDepth } : {}),
				...(save ? { savePage: crawl.savePage } : {}),
			});
			const pages = crawled.map((page) =>
				page.ok
					? {
							url: page.url,
							title: page.title ?? null,
							textChars: page.text.length,
						}
					: {
							url: page.url,
							error: page.error,
						},
			);

			return json({
				startUrl,
				visited: pages.length,
				pages,
			});
		},
	},
];

export const MEMORY_TOOL_CONFIGS: readonly DomainToolConfig[] = [
	{
		toolId: 'get_memory_tree',
		description:
			'Returns the structure of the memory directory including file names and their top-level Markdown headings to understand where information is stored.',
		inputSchema: {
			type: 'object',
			properties: {},
			required: [],
		},
		handler: async (_args, ctx) => {
			const tree = await createMemoryStore(ctx.projectDir).getTree();
			return json({ root: '.langflower/memory', files: tree });
		},
	},
	{
		toolId: 'read_memory_section',
		description:
			'Reads the content of a memory file. Can optionally target a specific Markdown heading section.',
		inputSchema: {
			type: 'object',
			properties: {
				file_path: {
					type: 'string',
					description:
						"Relative path to the file inside the memory folder, e.g., 'core/project_summary.md'",
				},
				heading: {
					type: 'string',
					description:
						"Optional Markdown heading (e.g., '## Architecture' or 'Database Schema'). If omitted, the entire file is returned.",
				},
			},
			required: ['file_path'],
		},
		handler: async (args, ctx) => {
			const filePath = requireString(args, 'file_path');
			const heading = asString(args, 'heading')?.trim();
			const content = await createMemoryStore(ctx.projectDir).readSection(
				filePath,
				heading !== undefined && heading.length > 0
					? heading
					: undefined,
			);
			return json({ file_path: filePath, content });
		},
	},
	{
		toolId: 'search_memory_grep',
		description:
			'Performs a fast, deterministic regex/keyword search across all files in the memory directory. Returns matching lines with file paths.',
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description:
						"The search term or regular expression pattern (e.g., 'auth-tokens' or '#todo').",
				},
			},
			required: ['query'],
		},
		handler: async (args, ctx) => {
			const query = requireString(args, 'query');
			const hits = await createMemoryStore(ctx.projectDir).searchGrep(
				query,
			);
			return json({
				query,
				hits,
				count: hits.length,
			});
		},
	},
	{
		toolId: 'append_memory_log',
		description:
			'Appends a new text entry or bullet point strictly to the end of a memory file. Use this for logging events, history, or chronological notes.',
		inputSchema: {
			type: 'object',
			properties: {
				file_path: {
					type: 'string',
					description:
						"Relative path to the file inside the memory folder, e.g., 'history/2026-07-daily.md'",
				},
				content: {
					type: 'string',
					description:
						"The text content to append. Include necessary Markdown formatting (e.g., '- New event description').",
				},
			},
			required: ['file_path', 'content'],
		},
		handler: async (args, ctx) => {
			const filePath = requireString(args, 'file_path');
			const content = requireString(args, 'content');
			await createMemoryStore(ctx.projectDir).appendLog(
				filePath,
				content,
			);
			return json({ file_path: filePath, ok: true });
		},
	},
	{
		toolId: 'update_memory_section',
		description:
			'Updates or creates a specific Markdown heading section with new content. Replaces the old section content entirely. Keeps the rest of the file untouched.',
		inputSchema: {
			type: 'object',
			properties: {
				file_path: {
					type: 'string',
					description:
						"Relative path to the file inside the memory folder, e.g., 'core/project_summary.md'",
				},
				heading: {
					type: 'string',
					description:
						"The exact title of the Markdown section to update (e.g., '## Dependencies'). If it doesn't exist, it will be created.",
				},
				new_content: {
					type: 'string',
					description:
						'The new markdown body for this section. Do not include the heading itself here, only the content beneath it.',
				},
			},
			required: ['file_path', 'heading', 'new_content'],
		},
		handler: async (args, ctx) => {
			const filePath = requireString(args, 'file_path');
			const heading = requireString(args, 'heading');
			const newContent = requireString(args, 'new_content');
			await createMemoryStore(ctx.projectDir).updateSection(
				filePath,
				heading,
				newContent,
			);
			return json({ file_path: filePath, heading, ok: true });
		},
	},
	{
		toolId: 'create_memory_file',
		description:
			'Creates a new empty memory file or initializes it with basic top-level structure. Fails if the file already exists.',
		inputSchema: {
			type: 'object',
			properties: {
				file_path: {
					type: 'string',
					description:
						"Relative path for the new file, e.g., 'context/feature_auth.md'",
				},
				initial_content: {
					type: 'string',
					description:
						'Optional initial markdown template or description to write into the file.',
				},
			},
			required: ['file_path'],
		},
		handler: async (args, ctx) => {
			const filePath = requireString(args, 'file_path');
			const initial = asString(args, 'initial_content');
			await createMemoryStore(ctx.projectDir).createFile(
				filePath,
				initial,
			);
			return json({ file_path: filePath, ok: true });
		},
	},
];
