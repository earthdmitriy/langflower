import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { TextEmbedder } from './text-embedder.ts';
import { l2Normalize, loadVecIndex, topCosine } from './vectors.ts';

export type SearchHit = {
	readonly path: string;
	readonly heading: string;
	readonly score: number;
	readonly text: string;
};

export type RunSearchOptions = {
	readonly sqlitePath: string;
	readonly query: string;
	readonly topK: number;
	readonly embedder: TextEmbedder;
};

type ChunkRow = {
	readonly id: string;
	readonly path: string;
	readonly heading: string;
	readonly text: string;
};

type RankedId = {
	readonly id: string;
};

const RRF_K = 60;

const FTS_TOKEN = /[\p{L}\p{N}_]+/gu;

const asChunkRow = (row: unknown): ChunkRow => {
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
	const id = (row as { id: unknown }).id;
	const path = (row as { path: unknown }).path;
	const heading = (row as { heading: unknown }).heading;
	const text = (row as { text: unknown }).text;
	if (
		typeof id !== 'string' ||
		typeof path !== 'string' ||
		typeof heading !== 'string' ||
		typeof text !== 'string'
	) {
		throw new Error('chunk row has invalid types');
	}
	return { id, path, heading, text };
};

type VecRow = {
	readonly id: string;
	readonly dim: number;
	readonly vector: Uint8Array;
};

const asVecRow = (row: unknown): VecRow => {
	if (
		row === null ||
		typeof row !== 'object' ||
		!('id' in row) ||
		!('dim' in row) ||
		!('vector' in row)
	) {
		throw new Error('Unexpected chunk_vec row');
	}
	const id = (row as { id: unknown }).id;
	const dimRaw = (row as { dim: unknown }).dim;
	const vector = (row as { vector: unknown }).vector;
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

const retrieveCandidateLimit = (topK: number): number => Math.max(topK * 4, 32);

/** Quoted FTS5 tokens so chat text cannot inject MATCH operators. */
export const ftsMatchQuery = (raw: string): string | undefined => {
	const tokens = raw.match(FTS_TOKEN);
	if (tokens === null || tokens.length === 0) {
		return undefined;
	}
	return tokens.map((token) => `"${token.replaceAll('"', '')}"`).join(' ');
};

export const reciprocalRankFusion = (
	lists: readonly (readonly RankedId[])[],
	k: number,
): readonly { readonly id: string; readonly score: number }[] => {
	const scores = new Map<string, number>();
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

export const formatHitsText = (
	query: string,
	hits: readonly SearchHit[],
): string => {
	if (hits.length === 0) {
		return `Question:\n${query}\n\nNo hits.`;
	}
	const blocks = hits.map((hit, index) => {
		const heading = hit.heading.length > 0 ? hit.heading : '(intro)';
		const score = hit.score.toFixed(2);
		return `${String(index + 1)}. ${hit.path} — ${heading} (${score})\n${hit.text}`;
	});
	return `Question:\n${query}\n\nContext:\n${blocks.join('\n\n')}`;
};

const hasFtsTable = (db: DatabaseSync): boolean => {
	const row = db
		.prepare(
			`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'chunk_fts'`,
		)
		.get() as { ok?: unknown } | undefined;
	return row !== undefined;
};

const ftsRankedIds = (
	db: DatabaseSync,
	query: string,
	limit: number,
): readonly RankedId[] => {
	if (!hasFtsTable(db)) {
		return [];
	}
	const match = ftsMatchQuery(query);
	if (match === undefined) {
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
				typeof (row as { id: unknown }).id !== 'string'
			) {
				return [];
			}
			return [{ id: (row as { id: string }).id }];
		});
	} catch {
		return [];
	}
};

export const runSearch = async (
	options: RunSearchOptions,
): Promise<{
	readonly hits: readonly SearchHit[];
	readonly text: string;
}> => {
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
		let cosineList: readonly RankedId[] = [];
		if (index.dim > 0) {
			const [raw] = await options.embedder.embedTexts([query]);
			if (raw === undefined) {
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
					return [parsed.id, parsed] as const;
				}),
		);
		const hits: SearchHit[] = [];
		for (const item of fused) {
			const chunk = byId.get(item.id);
			if (chunk === undefined) {
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
