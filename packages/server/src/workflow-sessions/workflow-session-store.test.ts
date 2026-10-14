import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkflowSessionFile } from '@langflower/shared/types/workflow-session.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowSessionStore } from './workflow-session-store.js';

const sample = (
	overrides: Partial<WorkflowSessionFile> = {},
): WorkflowSessionFile => ({
	schemaVersion: 1,
	sessionId: 'session-1',
	workflowId: 'wf-1',
	label: '2026-10-14 #1',
	localDay: '2026-10-14',
	ordinal: 1,
	createdAt: '2026-10-14T00:00:00.000Z',
	updatedAt: '2026-10-14T00:00:00.000Z',
	workflowSnapshot: {
		workflowId: 'wf-1',
		metadata: {
			name: 'Demo',
			createdAt: '2026-10-14T00:00:00.000Z',
			updatedAt: '2026-10-14T00:00:00.000Z',
		},
		graph: {
			viewport: { x: 0, y: 0, scale: 1 },
			nodes: [],
			edges: [],
		},
	},
	nodeStates: {},
	headOffset: null,
	points: [
		{
			pointId: 'point-1',
			runId: 'run-1',
			createdAt: '2026-10-14T01:00:00.000Z',
			workflowFingerprint: 'v1::: ',
			completedNodeIds: [],
			outputSnapshots: {},
			nodeStates: {},
			runOffset: 0,
			feedOffset: 0,
		},
	],
	...overrides,
});

describe('WorkflowSessionStore', () => {
	let projectDir: string;

	afterEach(async () => {
		if (projectDir !== undefined) {
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	it('keeps creation order after a later flush', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-'));
		const store = new WorkflowSessionStore(projectDir);
		await store.write(
			sample({
				sessionId: 'session-old',
				label: '2026-10-14 #1',
				createdAt: '2026-10-14T01:00:00.000Z',
				updatedAt: '2026-10-14T05:00:00.000Z',
			}),
		);
		await store.write(
			sample({
				sessionId: 'session-new',
				label: '2026-10-14 #2',
				ordinal: 2,
				createdAt: '2026-10-14T02:00:00.000Z',
				updatedAt: '2026-10-14T02:00:00.000Z',
			}),
		);

		const listed = await store.list('wf-1');

		expect(listed.ok).toBe(true);
		if (listed.ok) {
			expect(listed.value.map((row) => row.sessionId)).toEqual([
				'session-old',
				'session-new',
			]);
		}
	});

	it('reuses the highest ordinal after that session is deleted', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-'));
		const store = new WorkflowSessionStore(projectDir);
		await store.write(sample());
		await store.write(
			sample({
				sessionId: 'session-2',
				label: '2026-10-14 #2',
				ordinal: 2,
			}),
		);
		await store.write(
			sample({
				sessionId: 'session-other-day',
				label: '2026-10-13 #9',
				localDay: '2026-10-13',
				ordinal: 9,
			}),
		);

		expect((await store.nextOrdinal('wf-1', '2026-10-14')).value).toBe(3);
		await store.delete('wf-1', 'session-2');
		expect((await store.nextOrdinal('wf-1', '2026-10-14')).value).toBe(2);
		expect((await store.nextOrdinal('wf-1', '2026-10-15')).value).toBe(1);
	});

	it('reads schema 1 and does not count corrupt or other versions', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-'));
		const store = new WorkflowSessionStore(projectDir);
		await store.write(
			sample({
				sessionId: 'session-4',
				ordinal: 4,
				label: '2026-10-14 #4',
			}),
		);
		const read = await store.read('wf-1', 'session-4');
		expect(read.ok).toBe(true);
		if (read.ok) {
			expect(read.value.schemaVersion).toBe(1);
		}

		const dir = path.join(projectDir, '.langflower', 'sessions', 'wf-1');
		const partialPath = path.join(dir, '2026-10-14 #9.json');
		const partial = '{"schemaVersion":1,"sessionId":"partial"}\n';
		const foreignPath = path.join(dir, '2026-10-14 #8.json');
		const foreign =
			'{"schemaVersion":2,"sessionId":"foreign","label":"2026-10-14 #8"}\n';
		await fs.writeFile(partialPath, partial, 'utf8');
		await fs.writeFile(foreignPath, foreign, 'utf8');

		expect((await store.nextOrdinal('wf-1', '2026-10-14')).value).toBe(5);
		expect(await fs.readFile(partialPath, 'utf8')).toBe(partial);
		expect(await fs.readFile(foreignPath, 'utf8')).toBe(foreign);
		const listed = await store.list('wf-1');
		expect(listed.ok).toBe(true);
		if (listed.ok) {
			const corrupt = listed.value
				.filter((row) => row.corrupt === true)
				.map((row) => row.label)
				.sort();
			expect(corrupt).toEqual(['2026-10-14 #8', '2026-10-14 #9']);
		}
	});

	it('refuses the next ordinal when a session file cannot be read', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-'));
		const store = new WorkflowSessionStore(projectDir);
		await store.write(sample({ ordinal: 4, label: '2026-10-14 #4' }));
		const dir = path.join(projectDir, '.langflower', 'sessions', 'wf-1');
		await fs.mkdir(path.join(dir, 'locked.json'));

		const next = await store.nextOrdinal('wf-1', '2026-10-14');

		expect(next.ok).toBe(false);
		if (!next.ok) {
			expect(next.code).toBe('WRITE_FAILED');
		}
	});

	it('ignores corrupt files when choosing the next ordinal', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-'));
		const store = new WorkflowSessionStore(projectDir);
		await store.write(sample({ ordinal: 4, label: '2026-10-14 #4' }));
		const dir = path.join(projectDir, '.langflower', 'sessions', 'wf-1');
		await fs.writeFile(path.join(dir, 'broken.json'), '{', 'utf8');

		expect((await store.nextOrdinal('wf-1', '2026-10-14')).value).toBe(5);
		const listed = await store.list('wf-1');
		expect(listed.ok).toBe(true);
		if (listed.ok) {
			expect(
				listed.value.find((row) => row.sessionId === 'broken')?.corrupt,
			).toBe(true);
		}
	});

	it('rejects path segments that could escape the sessions directory', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-'));
		const store = new WorkflowSessionStore(projectDir);
		const badIds = ['', '..', '../evil', 'a/b', 'a\\b', 'C:name', 'a\0b'];

		for (const id of badIds) {
			expect((await store.read(id, 'session-1')).ok).toBe(false);
			expect((await store.read('wf-1', id)).ok).toBe(false);
			expect((await store.list(id)).ok).toBe(false);
			expect((await store.delete('wf-1', id)).ok).toBe(false);
			expect((await store.deleteAll(id)).ok).toBe(false);
			expect((await store.nextOrdinal(id, '2026-10-14')).ok).toBe(false);
			expect((await store.moveAll(id, 'wf-2')).ok).toBe(false);
			expect((await store.write(sample({ workflowId: id }))).ok).toBe(
				false,
			);
		}
	});

	it('reports corrupt JSON without throwing', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-'));
		const dir = path.join(projectDir, '.langflower', 'sessions', 'wf-1');
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(dir, 'session-1.json'), '{', 'utf8');

		const store = new WorkflowSessionStore(projectDir);
		const loaded = await store.read('wf-1', 'session-1');
		expect(loaded.ok).toBe(false);
		if (!loaded.ok) {
			expect(loaded.code).toBe('CORRUPT');
			expect(loaded.corrupt).toBe(true);
		}
	});

	it('writes a complete JSON file and leaves no temp file', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-'));
		const store = new WorkflowSessionStore(projectDir);
		expect((await store.write(sample())).ok).toBe(true);

		const dir = path.join(projectDir, '.langflower', 'sessions', 'wf-1');
		const names = await fs.readdir(dir);
		expect(names).toEqual(['2026-10-14 #1.json']);
		const text = await fs.readFile(
			path.join(dir, '2026-10-14 #1.json'),
			'utf8',
		);
		expect(JSON.parse(text)).toMatchObject({
			schemaVersion: 1,
			sessionId: 'session-1',
			ordinal: 1,
		});

		const loaded = await store.read('wf-1', 'session-1');
		expect(loaded.ok).toBe(true);
		if (loaded.ok) {
			expect(loaded.value.points).toHaveLength(1);
		}
	});

	it('does not overlap writes for the same session', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-'));
		const store = new WorkflowSessionStore(projectDir);
		await store.write(sample());

		let stage = 'idle';
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const first = store.update('wf-1', 'session-1', async (current) => {
			stage = 'first-entered';
			await gate;
			const mid = await store.read('wf-1', 'session-1');
			expect(mid.ok).toBe(true);
			if (mid.ok) {
				expect(mid.value.label).toBe('2026-10-14 #1');
			}
			stage = 'first-exiting';
			return { ...current, label: 'first' };
		});

		await vi.waitFor(() => {
			expect(stage).toBe('first-entered');
		});
		const second = store.write(sample({ label: 'second' }));
		expect(stage).toBe('first-entered');
		release();
		await first;
		await second;
		expect(stage).toBe('first-exiting');

		const final = await store.read('wf-1', 'session-1');
		expect(final.ok).toBe(true);
		if (final.ok) {
			expect(final.value.label).toBe('second');
		}
	});
});
