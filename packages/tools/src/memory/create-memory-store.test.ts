import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from './create-memory-store.js';

const tempDirs: string[] = [];

const makeProject = async (): Promise<string> => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-memory-'));
	tempDirs.push(dir);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe('createMemoryStore', () => {
	it('creates, trees, reads sections, greps, appends, and updates', async () => {
		const project = await makeProject();
		const store = createMemoryStore(project);

		await store.createFile(
			'core/summary.md',
			'# Summary\n\n## Stack\n\nNode\n\n## Goals\n\nold\n',
		);

		const tree = await store.getTree();
		expect(tree).toEqual([
			{
				file_path: 'core/summary.md',
				headings: [
					{ level: 1, title: 'Summary' },
					{ level: 2, title: 'Stack' },
					{ level: 2, title: 'Goals' },
				],
			},
		]);

		const section = await store.readSection('core/summary.md', '## Stack');
		expect(section).toContain('## Stack');
		expect(section).toContain('Node');
		expect(section).not.toContain('Goals');

		await store.updateSection('core/summary.md', '## Goals', 'ship memory');
		const updated = await store.readSection('core/summary.md', 'Goals');
		expect(updated).toContain('ship memory');
		expect(updated).not.toContain('old');

		await expect(
			store.updateSection('core/summary.md', '## Goals', '   '),
		).rejects.toThrow(/must not be empty/);

		await store.appendLog('history/day.md', '- started');
		await store.appendLog('history/day.md', '- finished');
		const log = await store.readSection('history/day.md');
		expect(log).toBe('- started\n- finished\n');

		const hits = await store.searchGrep('ship memory');
		expect(hits.some((hit) => hit.includes('core/summary.md'))).toBe(true);

		await expect(
			store.createFile('core/summary.md', 'nope'),
		).rejects.toThrow(/already exists/);
	});

	it('rejects path escape outside memory root', async () => {
		const project = await makeProject();
		const store = createMemoryStore(project);

		await expect(store.readSection('../secrets/x.md')).rejects.toThrow();
	});
});
