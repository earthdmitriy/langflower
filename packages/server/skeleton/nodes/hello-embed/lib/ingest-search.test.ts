import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runIngest } from './ingest.ts';
import { DEFAULT_SQLITE_PATH } from './paths.ts';
import { runSearch } from './search.ts';
import type { TextEmbedder } from './text-embedder.ts';
import { l2Normalize } from './vectors.ts';

const fakeEmbedder = (): TextEmbedder => ({
	expectedDim: 8,
	embedTexts: async (texts) =>
		texts.map((text) => {
			const values = new Array<number>(8).fill(0);
			if (text.toLowerCase().includes('alpha')) {
				values[0] = 1;
			} else if (text.toLowerCase().includes('beta')) {
				values[1] = 1;
			} else {
				values[7] = 1;
			}
			return l2Normalize(values);
		}),
});

const collect = async <T>(iter: AsyncIterable<T>): Promise<readonly T[]> => {
	const events: T[] = [];
	for await (const event of iter) {
		events.push(event);
	}
	return events;
};

const progressTexts = (
	events: readonly { readonly kind: string; readonly text?: string }[],
): readonly string[] =>
	events.flatMap((event) =>
		event.kind === 'progress' && event.text !== undefined
			? [event.text]
			: [],
	);

describe('ingest + search libs', () => {
	let root: string;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'hello-embed-lib-'));
		await fs.writeFile(
			path.join(root, 'notes.md'),
			'# Alpha\nalpha body\n\n# Beta\nbeta body\n',
			'utf8',
		);
	});

	afterEach(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	it('indexes heading chunks and ranks the matching query first', async () => {
		const sqlitePath = path.join(root, DEFAULT_SQLITE_PATH);
		const events = await collect(
			runIngest({
				sqlitePath,
				sourceDir: root,
				embedder: fakeEmbedder(),
			}),
		);
		expect(events.at(-1)).toMatchObject({
			kind: 'finish',
			chunkCount: 2,
		});

		const result = await runSearch({
			sqlitePath,
			query: 'alpha',
			topK: 8,
			embedder: fakeEmbedder(),
		});
		expect(result.hits[0]?.heading).toBe('Alpha');
		expect(result.text).toContain('Question:\n');
		expect(result.text).toContain('alpha');
		expect(result.text).toContain('Context:');
		expect(result.text).toContain('notes.md');
	});

	it('prefixes progress with a zero-padded chunk counter', async () => {
		const events = await collect(
			runIngest({
				sqlitePath: path.join(root, DEFAULT_SQLITE_PATH),
				sourceDir: root,
				embedder: fakeEmbedder(),
			}),
		);
		expect(progressTexts(events)).toEqual([
			'(1/2) notes.md — Alpha',
			'(2/2) notes.md — Beta',
		]);
	});

	it('pads the progress counter to the digit width of the total', async () => {
		const headings = Array.from(
			{ length: 10 },
			(_, index) => `# H${String(index)}\nbody\n`,
		).join('\n');
		await fs.writeFile(path.join(root, 'notes.md'), headings, 'utf8');
		const events = await collect(
			runIngest({
				sqlitePath: path.join(root, DEFAULT_SQLITE_PATH),
				sourceDir: root,
				embedder: fakeEmbedder(),
			}),
		);
		const lines = progressTexts(events);
		expect(lines[0]).toBe('(01/10) notes.md — H0');
		expect(lines.at(-1)).toBe('(10/10) notes.md — H9');
		expect(lines).toHaveLength(10);
	});

	it('errors when the sqlite file is missing', async () => {
		await expect(
			runSearch({
				sqlitePath: path.join(root, 'missing.sqlite'),
				query: 'alpha',
				topK: 8,
				embedder: fakeEmbedder(),
			}),
		).rejects.toThrow(/Run kb-ingest first/);
	});

	it('packs full chunk bodies into Question/Context text', async () => {
		const longBody = `alpha ${'x'.repeat(280)}`;
		await fs.writeFile(
			path.join(root, 'notes.md'),
			`# Alpha\n${longBody}\n`,
			'utf8',
		);
		const sqlitePath = path.join(root, DEFAULT_SQLITE_PATH);
		await collect(
			runIngest({
				sqlitePath,
				sourceDir: root,
				embedder: fakeEmbedder(),
			}),
		);
		const result = await runSearch({
			sqlitePath,
			query: 'alpha',
			topK: 8,
			embedder: fakeEmbedder(),
		});
		expect(result.text).toContain('Question:\nalpha');
		expect(result.text).toContain(longBody);
		expect(result.text.includes(`${'x'.repeat(237)}…`)).toBe(false);
	});

	it('ranks a keyword-only FTS hit above equal cosine dummies', async () => {
		await fs.writeFile(
			path.join(root, 'notes.md'),
			'# Alpha\nalpha body\n\n# Beta\nbeta body xylophoneunique\n',
			'utf8',
		);
		const sqlitePath = path.join(root, DEFAULT_SQLITE_PATH);
		await collect(
			runIngest({
				sqlitePath,
				sourceDir: root,
				embedder: fakeEmbedder(),
			}),
		);
		const result = await runSearch({
			sqlitePath,
			query: 'xylophoneunique',
			topK: 8,
			embedder: fakeEmbedder(),
		});
		expect(result.hits[0]?.heading).toBe('Beta');
		expect(result.text).toContain('xylophoneunique');
	});
});
