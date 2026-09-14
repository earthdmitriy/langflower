import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chunkMarkdown } from './chunk-markdown.ts';
import { SCHEMA_SQL } from './schema.ts';
import type { TextEmbedder } from './text-embedder.ts';
import { walkMarkdown } from './walk-markdown.ts';
import { clearVecCache, float32ToBlob, l2Normalize } from './vectors.ts';

export type IngestProgressEvent = {
	readonly kind: 'progress';
	readonly text: string;
};

export type IngestFinishEvent = {
	readonly kind: 'finish';
	readonly chunkCount: number;
	readonly fileCount: number;
};

export type IngestEvent = IngestProgressEvent | IngestFinishEvent;

export type RunIngestOptions = {
	readonly sqlitePath: string;
	readonly sourceDir: string;
	readonly embedder: TextEmbedder;
};

const dimMismatchMessage = (got: number, stored: number): string =>
	`Embedding dim ${String(got)} does not match stored dim ${String(stored)}. Re-run ingest after switching models.`;

const padCount = (value: number, width: number): string =>
	String(value).padStart(width, '0');

export const runIngest = async function* (
	options: RunIngestOptions,
): AsyncGenerator<IngestEvent> {
	const { sqlitePath, sourceDir, embedder } = options;
	await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
	try {
		await fs.unlink(sqlitePath);
	} catch (error) {
		const code =
			error !== null && typeof error === 'object' && 'code' in error
				? String((error as { code: unknown }).code)
				: '';
		if (code !== 'ENOENT') {
			throw error;
		}
	}

	const db = new DatabaseSync(sqlitePath);
	try {
		db.exec('PRAGMA journal_mode = WAL');
		db.exec('PRAGMA foreign_keys = ON');
		db.exec(SCHEMA_SQL);
		clearVecCache();

		const files = await walkMarkdown(sourceDir);
		const readable = files.filter((file) => file.skipped === undefined);
		for (const file of files) {
			if (file.skipped !== undefined) {
				yield { kind: 'progress', text: file.skipped };
			}
		}

		if (readable.length === 0) {
			yield { kind: 'progress', text: 'no markdown files' };
			yield { kind: 'finish', chunkCount: 0, fileCount: 0 };
			return;
		}

		const chunks = readable.flatMap((file) =>
			chunkMarkdown(file.relPath, file.text),
		);
		const insertChunk = db.prepare(
			'INSERT INTO chunk (id, path, heading, text, embed_text) VALUES (?, ?, ?, ?, ?)',
		);
		const insertVec = db.prepare(
			'INSERT INTO chunk_vec (id, dim, vector) VALUES (?, ?, ?)',
		);
		const insertFts = db.prepare(
			'INSERT INTO chunk_fts (id, heading, text) VALUES (?, ?, ?)',
		);

		let expectedDim = embedder.expectedDim;
		let embedded = 0;
		const width = String(chunks.length).length;
		for (const chunk of chunks) {
			if (chunk.truncated !== undefined) {
				yield { kind: 'progress', text: chunk.truncated };
			}
			const [raw] = await embedder.embedTexts([chunk.embedText]);
			if (raw === undefined) {
				throw new Error('Embedding returned no vector');
			}
			const vector = l2Normalize([...raw]);
			if (expectedDim === undefined) {
				expectedDim = vector.length;
			} else if (vector.length !== expectedDim) {
				throw new Error(dimMismatchMessage(vector.length, expectedDim));
			}
			insertChunk.run(
				chunk.id,
				chunk.path,
				chunk.heading,
				chunk.text,
				chunk.embedText,
			);
			insertVec.run(chunk.id, expectedDim, float32ToBlob(vector));
			insertFts.run(chunk.id, chunk.heading, chunk.text);
			embedded += 1;
			const label = chunk.heading.length > 0 ? chunk.heading : '(intro)';
			yield {
				kind: 'progress',
				text: `(${padCount(embedded, width)}/${padCount(chunks.length, width)}) ${chunk.path} — ${label}`,
			};
		}

		yield {
			kind: 'finish',
			chunkCount: embedded,
			fileCount: readable.length,
		};
	} finally {
		db.close();
	}
};
