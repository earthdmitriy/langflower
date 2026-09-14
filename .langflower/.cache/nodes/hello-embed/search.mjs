// search.ts
import {
	defineNode,
	EMBED_HANDLE_WIRE_TYPE,
	isEmbedHandle,
} from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/@langflower/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js';

// lib/paths.ts
import path from 'node:path';
var DEFAULT_SQLITE_PATH = '.langflower/.cache/hello-embed/kb.sqlite';
var DEFAULT_SEARCH_TOP_K = 8;
var MAX_SEARCH_TOP_K = 50;
var MAX_FILE_BYTES = 512 * 1024;
var resolveUnderProject = (projectDir, relativeOrEmpty) => {
	const root = path.resolve(projectDir);
	const trimmed = relativeOrEmpty.trim();
	const resolved =
		trimmed.length === 0
			? root
			: path.isAbsolute(trimmed)
				? path.resolve(trimmed)
				: path.resolve(root, trimmed);
	const rel = path.relative(root, resolved);
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		throw new Error(`Path escapes projectDir: ${trimmed}`);
	}
	return resolved;
};
var resolveSqlitePath = (projectDir, override) => {
	const raw =
		typeof override === 'string' && override.trim().length > 0
			? override.trim()
			: DEFAULT_SQLITE_PATH;
	return resolveUnderProject(projectDir, raw);
};
var clampTopK = (value, fallback) => {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim().length > 0
				? Number(value)
				: fallback;
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.min(MAX_SEARCH_TOP_K, Math.max(1, Math.floor(parsed)));
};

// lib/search.ts
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// lib/vectors.ts
var l2Normalize = (values) => {
	const out = new Float32Array(values.length);
	let sumSq = 0;
	for (let i = 0; i < values.length; i += 1) {
		const n = values[i] ?? 0;
		out[i] = n;
		sumSq += n * n;
	}
	const norm = Math.sqrt(sumSq);
	if (norm === 0) {
		return out;
	}
	const scale = 1 / norm;
	for (let i = 0; i < out.length; i += 1) {
		out[i] = (out[i] ?? 0) * scale;
	}
	return out;
};
var blobToFloat32 = (blob) => {
	const copy = new Uint8Array(blob.byteLength);
	copy.set(blob);
	return new Float32Array(copy.buffer);
};
var vecCache = /* @__PURE__ */ new Map();
var loadVecIndex = (sqlitePath, rows, mtimeMs) => {
	const cached = vecCache.get(sqlitePath);
	if (cached !== void 0 && cached.mtimeMs === mtimeMs) {
		return cached;
	}
	if (rows.length === 0) {
		const empty = {
			sqlitePath,
			mtimeMs,
			dim: 0,
			ids: [],
			matrix: new Float32Array(0),
		};
		vecCache.set(sqlitePath, empty);
		return empty;
	}
	const dim = rows[0]?.dim ?? 0;
	const ids = [];
	const matrix = new Float32Array(rows.length * dim);
	rows.forEach((row, index2) => {
		if (row.dim !== dim) {
			throw new Error(
				`chunk_vec dim mismatch: ${String(row.dim)} vs ${String(dim)} at ${row.id}`,
			);
		}
		ids.push(row.id);
		const floats = blobToFloat32(row.vector);
		if (floats.length !== dim) {
			throw new Error(
				`chunk_vec blob length ${String(floats.length)} != dim ${String(dim)} at ${row.id}`,
			);
		}
		matrix.set(floats, index2 * dim);
	});
	const index = {
		sqlitePath,
		mtimeMs,
		dim,
		ids,
		matrix,
	};
	vecCache.set(sqlitePath, index);
	return index;
};
var topCosine = (index, query, limit) => {
	if (index.dim === 0 || index.ids.length === 0) {
		return [];
	}
	if (query.length !== index.dim) {
		return [];
	}
	const scored = [];
	for (let row = 0; row < index.ids.length; row += 1) {
		const offset = row * index.dim;
		let sum = 0;
		for (let i = 0; i < index.dim; i += 1) {
			sum += (query[i] ?? 0) * (index.matrix[offset + i] ?? 0);
		}
		const id = index.ids[row];
		if (id !== void 0) {
			scored.push({ id, score: sum });
		}
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, Math.max(0, limit));
};

// lib/search.ts
var RRF_K = 60;
var FTS_TOKEN = /[\p{L}\p{N}_]+/gu;
var asChunkRow = (row) => {
	if (
		row === null ||
		typeof row !== 'object' ||
		!('id' in row) ||
		!('path' in row) ||
		!('heading' in row) ||
		!('text' in row)
	) {
		throw new Error('Unexpected chunk row');
	}
	const id = row.id;
	const path2 = row.path;
	const heading = row.heading;
	const text = row.text;
	if (
		typeof id !== 'string' ||
		typeof path2 !== 'string' ||
		typeof heading !== 'string' ||
		typeof text !== 'string'
	) {
		throw new Error('chunk row has invalid types');
	}
	return { id, path: path2, heading, text };
};
var asVecRow = (row) => {
	if (
		row === null ||
		typeof row !== 'object' ||
		!('id' in row) ||
		!('dim' in row) ||
		!('vector' in row)
	) {
		throw new Error('Unexpected chunk_vec row');
	}
	const id = row.id;
	const dimRaw = row.dim;
	const vector = row.vector;
	const dim = typeof dimRaw === 'bigint' ? Number(dimRaw) : dimRaw;
	if (
		typeof id !== 'string' ||
		typeof dim !== 'number' ||
		!(vector instanceof Uint8Array)
	) {
		throw new Error('chunk_vec row has invalid types');
	}
	return { id, dim, vector };
};
var retrieveCandidateLimit = (topK) => Math.max(topK * 4, 32);
var ftsMatchQuery = (raw) => {
	const tokens = raw.match(FTS_TOKEN);
	if (tokens === null || tokens.length === 0) {
		return void 0;
	}
	return tokens.map((token) => `"${token.replaceAll('"', '')}"`).join(' ');
};
var reciprocalRankFusion = (lists, k) => {
	const scores = /* @__PURE__ */ new Map();
	for (const list of lists) {
		list.forEach((item, index) => {
			const rank = index + 1;
			scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank));
		});
	}
	return [...scores.entries()]
		.map(([id, score]) => ({ id, score }))
		.sort((left, right) => right.score - left.score);
};
var formatHitsText = (query, hits) => {
	if (hits.length === 0) {
		return `Question:
${query}

No hits.`;
	}
	const blocks = hits.map((hit, index) => {
		const heading = hit.heading.length > 0 ? hit.heading : '(intro)';
		const score = hit.score.toFixed(2);
		return `${String(index + 1)}. ${hit.path} \u2014 ${heading} (${score})
${hit.text}`;
	});
	return `Question:
${query}

Context:
${blocks.join('\n\n')}`;
};
var hasFtsTable = (db) => {
	const row = db
		.prepare(
			`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'chunk_fts'`,
		)
		.get();
	return row !== void 0;
};
var ftsRankedIds = (db, query, limit) => {
	if (!hasFtsTable(db)) {
		return [];
	}
	const match = ftsMatchQuery(query);
	if (match === void 0) {
		return [];
	}
	try {
		const rows = db
			.prepare('SELECT id FROM chunk_fts WHERE chunk_fts MATCH ? LIMIT ?')
			.all(match, limit);
		return rows.flatMap((row) => {
			if (
				row === null ||
				typeof row !== 'object' ||
				!('id' in row) ||
				typeof row.id !== 'string'
			) {
				return [];
			}
			return [{ id: row.id }];
		});
	} catch {
		return [];
	}
};
var runSearch = async (options) => {
	const query = options.query.trim();
	if (!fs.existsSync(options.sqlitePath)) {
		throw new Error(
			`SQLite DB not found: ${options.sqlitePath}. Run kb-ingest first.`,
		);
	}
	if (query.length === 0) {
		return { hits: [], text: formatHitsText(query, []) };
	}
	const db = new DatabaseSync(options.sqlitePath);
	try {
		const candidateLimit = retrieveCandidateLimit(options.topK);
		const vecRows = db
			.prepare('SELECT id, dim, vector FROM chunk_vec')
			.all()
			.map((row) => asVecRow(row));
		const mtimeMs = fs.statSync(options.sqlitePath).mtimeMs;
		const index = loadVecIndex(
			options.sqlitePath,
			vecRows.map((row) => ({
				id: row.id,
				dim: row.dim,
				vector: row.vector,
			})),
			mtimeMs,
		);
		let cosineList = [];
		if (index.dim > 0) {
			const [raw] = await options.embedder.embedTexts([query]);
			if (raw === void 0) {
				throw new Error('Embedding returned no vector');
			}
			if (raw.length !== index.dim) {
				throw new Error(
					`Embedding dim ${String(raw.length)} does not match stored dim ${String(index.dim)}. Re-run ingest after switching models.`,
				);
			}
			const queryVec = l2Normalize([...raw]);
			cosineList = topCosine(index, queryVec, candidateLimit).map(
				(item) => ({ id: item.id }),
			);
		}
		const ftsList = ftsRankedIds(db, query, candidateLimit);
		const fused = reciprocalRankFusion(
			[cosineList, ftsList].filter((list) => list.length > 0),
			RRF_K,
		).slice(0, options.topK);
		const byId = new Map(
			db
				.prepare('SELECT id, path, heading, text FROM chunk')
				.all()
				.map((row) => {
					const parsed = asChunkRow(row);
					return [parsed.id, parsed];
				}),
		);
		const hits = [];
		for (const item of fused) {
			const chunk = byId.get(item.id);
			if (chunk === void 0) {
				continue;
			}
			hits.push({
				path: chunk.path,
				heading: chunk.heading,
				score: item.score,
				text: chunk.text,
			});
		}
		return { hits, text: formatHitsText(query, hits) };
	} finally {
		db.close();
	}
};

// lib/text-embedder.ts
var textEmbedderFromHandle = (handle, role) => ({
	expectedDim: handle.dim,
	embedTexts: (texts) => handle.embedTexts(texts, { role }),
});

// search.ts
var asString = (value, fallback) => {
	if (typeof value === 'string') {
		return value;
	}
	return fallback;
};
var search_default = defineNode({
	type: 'hello-embed-search',
	displayName: 'Hello Embed Search',
	category: 'Hello Embed',
	description:
		'Retrieve markdown chunks (vector cosine + FTS5, RRF top-K). text is Question + full-chunk Context for an LLM userPrompt. Wire embed from common-embed-provider.',
	uiSchema: [
		{
			field: 'sqlitePath',
			type: 'string',
			label: 'SQLite path',
			default: DEFAULT_SQLITE_PATH,
		},
		{
			field: 'topK',
			type: 'number',
			label: 'Top K',
			default: DEFAULT_SEARCH_TOP_K,
			min: 1,
			max: 50,
			step: 1,
		},
	],
	inputs: {
		query: {
			wireType: 'string',
			required: true,
			description: 'Search phrase.',
		},
		embed: {
			wireType: EMBED_HANDLE_WIRE_TYPE,
			required: true,
			description: 'Wire from common-embed-provider (fan-out OK).',
		},
	},
	outputs: {
		hits: {
			wireType: 'json',
			description:
				'Top-K hits with path, heading, RRF score, and full chunk text.',
		},
		text: {
			wireType: 'string',
			description:
				'Question + Context (full retrieved chunks) for Preview or LLM userPrompt.',
		},
	},
	async execute(ctx, inputs) {
		const embedInput = inputs['embed'];
		if (!isEmbedHandle(embedInput)) {
			throw new Error(
				'hello-embed-search requires a wired embed input from common-embed-provider.',
			);
		}
		const projectDir = String(ctx.projectDir ?? '');
		if (projectDir.length === 0) {
			throw new Error('hello-embed-search requires ctx.projectDir.');
		}
		const query = typeof inputs.query === 'string' ? inputs.query : '';
		const result = await runSearch({
			sqlitePath: resolveSqlitePath(
				projectDir,
				asString(ctx.params.sqlitePath, DEFAULT_SQLITE_PATH),
			),
			query,
			topK: clampTopK(ctx.params.topK, DEFAULT_SEARCH_TOP_K),
			embedder: textEmbedderFromHandle(embedInput, 'query'),
		});
		return {
			hits: result.hits,
			text: result.text,
		};
	},
});
export { search_default as default };
