import type { EmbedHandle, ToolHandle } from '@langflower/node-sdk';
import { createNodeHarness } from '@langflower/node-sdk/testing';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ingestNode from './ingest.ts';
import { DEFAULT_SQLITE_PATH } from './lib/paths.ts';
import { l2Normalize } from './lib/vectors.ts';
import searchNode from './search.ts';
import searchHandleNode from './search-handle.ts';

const sqliteDefaultOf = (definition: {
	readonly uiSchema: readonly {
		readonly field: string;
		readonly default?: unknown;
	}[];
}): unknown =>
	definition.uiSchema.find((item) => item.field === 'sqlitePath')?.default;

const fakeHandle = (): EmbedHandle => ({
	dim: 8,
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

describe('hello-embed nodes', () => {
	let root: string;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'hello-embed-node-'));
		await fs.writeFile(
			path.join(root, 'notes.md'),
			'# Alpha\nalpha body\n',
			'utf8',
		);
	});

	afterEach(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	it('shares DEFAULT_SQLITE_PATH as uiSchema default', () => {
		expect(sqliteDefaultOf(ingestNode)).toBe(DEFAULT_SQLITE_PATH);
		expect(sqliteDefaultOf(searchNode)).toBe(DEFAULT_SQLITE_PATH);
		expect(sqliteDefaultOf(searchHandleNode)).toBe(DEFAULT_SQLITE_PATH);
	});

	it('marks ingest progress as a growing progress stream', () => {
		const progress = ingestNode.outputsConfigs.find(
			(port) => port.portId === 'progress',
		);
		expect(progress?.feed).toEqual({
			role: 'progress',
			streaming: true,
		});
		const finish = ingestNode.outputsConfigs.find(
			(port) => port.portId === 'finish',
		);
		expect(finish?.feed).toEqual({ role: 'none' });
	});

	it('ingests then searches through createNodeHarness', async () => {
		const sqliteRel = 'index.sqlite';
		const ingest = createNodeHarness(ingestNode, {
			projectDir: root,
			params: { sqlitePath: sqliteRel },
		});
		const progress = ingest.collect<string>('progress');
		const finished = ingest.next<boolean>('finish');
		ingest.send('embed', fakeHandle());
		ingest.send('trigger', true);
		await expect(finished).resolves.toBe(true);
		expect(progress.values.some((line) => line.includes('notes.md'))).toBe(
			true,
		);
		ingest.dispose();

		const search = createNodeHarness(searchNode, {
			projectDir: root,
			params: { sqlitePath: sqliteRel, topK: 8 },
		});
		const text = search.next<string>('text');
		const hits = search.next<readonly { heading: string }[]>('hits');
		search.send('embed', fakeHandle());
		search.send('query', 'alpha');
		await expect(text).resolves.toContain('Question:\nalpha');
		await expect(text).resolves.toContain('Context:');
		await expect(text).resolves.toContain('alpha body');
		await expect(hits).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ heading: 'Alpha' }),
			]),
		);
		search.dispose();
	});

	it('search-handle emits project_search against the same sqlite path', async () => {
		const sqliteRel = 'index.sqlite';
		const ingest = createNodeHarness(ingestNode, {
			projectDir: root,
			params: { sqlitePath: sqliteRel },
		});
		const finished = ingest.next<boolean>('finish');
		ingest.send('embed', fakeHandle());
		ingest.send('trigger', true);
		await finished;
		ingest.dispose();

		const handle = createNodeHarness(searchHandleNode, {
			projectDir: root,
			params: { sqlitePath: sqliteRel },
		});
		const toolsP = handle.next<readonly ToolHandle[]>('tools');
		handle.send('embed', fakeHandle());
		const tools = await toolsP;
		const projectSearch = tools.find(
			(tool) => tool.toolId === 'project_search',
		);
		expect(projectSearch).toBeDefined();
		const text = await projectSearch?.invoke(
			{ query: 'alpha' },
			{
				projectDir: root,
				runId: 'test',
			},
		);
		expect(text).toContain('Question:\nalpha');
		expect(text).toContain('alpha body');
		handle.dispose();
	});

	it('search-handle returns full chunk bodies', async () => {
		const longBody = `alpha ${'y'.repeat(280)}`;
		await fs.writeFile(
			path.join(root, 'notes.md'),
			`# Alpha\n${longBody}\n`,
			'utf8',
		);
		const sqliteRel = 'index.sqlite';
		const ingest = createNodeHarness(ingestNode, {
			projectDir: root,
			params: { sqlitePath: sqliteRel },
		});
		const finished = ingest.next<boolean>('finish');
		ingest.send('embed', fakeHandle());
		ingest.send('trigger', true);
		await finished;
		ingest.dispose();

		const handle = createNodeHarness(searchHandleNode, {
			projectDir: root,
			params: { sqlitePath: sqliteRel },
		});
		const toolsP = handle.next<readonly ToolHandle[]>('tools');
		handle.send('embed', fakeHandle());
		const tools = await toolsP;
		const projectSearch = tools.find(
			(tool) => tool.toolId === 'project_search',
		);
		const packed = await projectSearch?.invoke(
			{ query: 'alpha' },
			{
				projectDir: root,
				runId: 'test',
			},
		);
		expect(packed).toContain(longBody);
		handle.dispose();
	});
});
