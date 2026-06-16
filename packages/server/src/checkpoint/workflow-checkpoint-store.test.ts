import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkflowCheckpoint } from '@langflower/shared/langflower.js';
import { WorkflowCheckpointStore } from './workflow-checkpoint-store.js';

const sample = (
	overrides: Partial<WorkflowCheckpoint> = {},
): WorkflowCheckpoint => ({
	schemaVersion: 1,
	runId: 'run-1',
	workflowId: 'wf-1',
	workflowFingerprint: 'v1:n1:common-string::',
	updatedAt: '2026-07-19T12:00:00.000Z',
	status: 'stopped',
	completedNodeIds: ['n1'],
	outputSnapshots: {
		n1: { value: { state: 'value', value: 'ok' } },
	},
	...overrides,
});

describe('WorkflowCheckpointStore', () => {
	let projectDir: string;

	afterEach(async () => {
		if (projectDir !== undefined) {
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	it('round-trips a checkpoint and lists resumable runs', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-ckpt-'));
		const store = new WorkflowCheckpointStore(projectDir);
		await store.save(sample());

		const loaded = await store.load('wf-1', 'run-1');
		expect(loaded.ok).toBe(true);
		if (loaded.ok) {
			expect(loaded.checkpoint.completedNodeIds).toEqual(['n1']);
		}

		const list = await store.listResumable('wf-1');
		expect(list).toHaveLength(1);
		expect(list[0]?.runId).toBe('run-1');
	});

	it('reports CORRUPT for invalid JSON', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-ckpt-'));
		const dir = path.join(
			projectDir,
			'.langflower',
			'runs',
			'wf-1',
			'run-bad',
		);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(dir, 'checkpoint.json'), '{', 'utf8');

		const store = new WorkflowCheckpointStore(projectDir);
		const loaded = await store.load('wf-1', 'run-bad');
		expect(loaded.ok).toBe(false);
		if (!loaded.ok) {
			expect(loaded.code).toBe('CORRUPT');
		}

		const list = await store.listResumable('wf-1');
		expect(list[0]?.corrupt).toBe(true);
	});

	it('hides completed checkpoints from resumable list', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-ckpt-'));
		const store = new WorkflowCheckpointStore(projectDir);
		await store.save(sample({ status: 'completed' }));

		expect(await store.listResumable('wf-1')).toEqual([]);
	});

	it('marks fingerprint mismatch as stale', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-ckpt-'));
		const store = new WorkflowCheckpointStore(projectDir);
		await store.save(sample());

		const list = await store.listResumable('wf-1', 'other-fingerprint');
		expect(list).toHaveLength(1);
		expect(list[0]?.stale).toBe(true);
		expect(list[0]?.runId).toBe('run-1');
	});
});
