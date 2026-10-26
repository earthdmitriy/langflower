#!/usr/bin/env node
/**
 * Dev-only stdio MCP server over the project knowledge-base index.
 *
 * Reuses the hello-embed pack (`lib/ingest.ts`, `lib/search.ts`) and the same
 * sqlite file the in-product `kb-ingest` / `kb-rag` workflows use, so agents
 * in Langflower and coding agents share one index.
 *
 * Embeddings come from an OpenAI-compatible server (LM Studio). Text prefixes
 * (`query: ` / `passage: `) match the `common-embed-provider` node; keep them
 * in sync or the shared index returns bad scores.
 *
 * Env:
 *   KB_EMBED_MODEL     required  embedding model id loaded in LM Studio
 *   KB_EMBED_BASE_URL  optional  default http://localhost:1234/v1
 *   KB_EMBED_API_KEY   optional  LM Studio API token (Bearer)
 *   KB_SQLITE_PATH     optional  project-relative override
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIngest } from '../../.langflower/nodes/hello-embed/lib/ingest.ts';
import {
	DEFAULT_SEARCH_TOP_K,
	clampTopK,
	resolveSqlitePath,
	resolveUnderProject,
} from '../../.langflower/nodes/hello-embed/lib/paths.ts';
import { runSearch } from '../../.langflower/nodes/hello-embed/lib/search.ts';

const projectDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..',
);
const baseUrl = (
	process.env.KB_EMBED_BASE_URL ?? 'http://localhost:1234/v1'
).replace(/\/+$/, '');
const apiKey = process.env.KB_EMBED_API_KEY ?? '';
const model = process.env.KB_EMBED_MODEL ?? '';
const sqlitePath = resolveSqlitePath(projectDir, process.env.KB_SQLITE_PATH);

const embedderFor = (prefix) => ({
	embedTexts: async (texts) => {
		if (model.length === 0) {
			throw new Error('KB_EMBED_MODEL is not set');
		}
		const response = await fetch(`${baseUrl}/embeddings`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(apiKey.length > 0
					? { authorization: `Bearer ${apiKey}` }
					: {}),
			},
			body: JSON.stringify({
				model,
				input: texts.map((text) => `${prefix}${text}`),
				encoding_format: 'float',
			}),
		});
		if (!response.ok) {
			throw new Error(
				`Embeddings request failed: HTTP ${String(response.status)} ${(await response.text()).slice(0, 300)}`,
			);
		}
		const body = await response.json();
		const data = [...(body.data ?? [])].sort(
			(left, right) => (left.index ?? 0) - (right.index ?? 0),
		);
		return data.map((item) => Float32Array.from(item.embedding));
	},
});

const tools = [
	{
		name: 'kb_search',
		description:
			'Hybrid (vector + keyword) search over the indexed project markdown. Returns packed Question/Context with path and heading per hit.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string' },
				topK: { type: 'number', description: 'Default 8, max 50.' },
			},
			required: ['query'],
		},
	},
	{
		name: 'kb_ingest',
		description:
			'Rebuild the shared index from project markdown (wipes and re-embeds everything; can take minutes). Run after docs change.',
		inputSchema: {
			type: 'object',
			properties: {
				sourceDir: {
					type: 'string',
					description:
						'Project-relative folder; empty = project root.',
				},
			},
		},
	},
];

const callSearch = async (args) => {
	const { text } = await runSearch({
		sqlitePath,
		query: String(args.query ?? ''),
		topK: clampTopK(args.topK, DEFAULT_SEARCH_TOP_K),
		embedder: embedderFor('query: '),
	});
	return text;
};

const callIngest = async (args) => {
	const sourceDir = resolveUnderProject(
		projectDir,
		typeof args.sourceDir === 'string' ? args.sourceDir : '',
	);
	const notes = [];
	let finish;
	for await (const event of runIngest({
		sqlitePath,
		sourceDir,
		embedder: embedderFor('passage: '),
	})) {
		if (event.kind === 'finish') {
			finish = event;
		} else if (!event.text.startsWith('(')) {
			notes.push(event.text);
		}
	}
	return [
		`Indexed ${String(finish?.chunkCount ?? 0)} chunks from ${String(finish?.fileCount ?? 0)} files into ${path.relative(projectDir, sqlitePath)}.`,
		...notes,
	].join('\n');
};

const handlers = { kb_search: callSearch, kb_ingest: callIngest };

const send = (message) =>
	process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

const handle = async (request) => {
	const { id, method, params } = request;
	if (id === undefined) {
		return;
	}
	if (method === 'initialize') {
		send({
			id,
			result: {
				protocolVersion: params?.protocolVersion ?? '2025-03-26',
				capabilities: { tools: {} },
				serverInfo: { name: 'langflower-kb', version: '0.1.0' },
			},
		});
	} else if (method === 'tools/list') {
		send({ id, result: { tools } });
	} else if (method === 'tools/call') {
		const handler = handlers[params?.name];
		if (handler === undefined) {
			send({ id, error: { code: -32602, message: 'Unknown tool' } });
			return;
		}
		try {
			const text = await handler(params.arguments ?? {});
			send({ id, result: { content: [{ type: 'text', text }] } });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			send({
				id,
				result: {
					isError: true,
					content: [{ type: 'text', text: message }],
				},
			});
		}
	} else if (method === 'ping') {
		send({ id, result: {} });
	} else {
		send({ id, error: { code: -32601, message: 'Method not found' } });
	}
};

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
	buffer += chunk;
	const lines = buffer.split('\n');
	buffer = lines.pop() ?? '';
	for (const line of lines) {
		if (line.trim().length === 0) {
			continue;
		}
		try {
			void handle(JSON.parse(line));
		} catch {
			/* ignore malformed frame */
		}
	}
});
