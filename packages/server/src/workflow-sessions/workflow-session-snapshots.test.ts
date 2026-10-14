import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import type { WorkflowSessionFile } from '@langflower/shared/types/workflow-session.js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LangflowerSession } from '../session/langflower-session.js';
import { readWorkflowSessionSnapshots } from './workflow-session-snapshots.js';
import { WorkflowSessionStore } from './workflow-session-store.js';

const document = (name: string): WorkflowLoadedPayload => ({
	workflowId: 'wf-1',
	metadata: {
		name,
		createdAt: '2026-10-14T00:00:00.000Z',
		updatedAt: '2026-10-14T00:00:00.000Z',
	},
	graph: {
		viewport: { x: 0, y: 0, scale: 1 },
		nodes: [],
		edges: [],
	},
});

const file = (
	sessionId: string,
	label: string,
	snapshot: WorkflowLoadedPayload,
): WorkflowSessionFile => ({
	schemaVersion: 1,
	sessionId,
	workflowId: 'wf-1',
	label,
	localDay: '2026-10-14',
	ordinal: 1,
	createdAt: '2026-10-14T00:00:00.000Z',
	updatedAt: '2026-10-14T00:00:00.000Z',
	workflowSnapshot: snapshot,
	nodeStates: {},
	headOffset: null,
	points: [],
});

describe('readWorkflowSessionSnapshots', () => {
	let projectDir: string | undefined;
	let session: LangflowerSession | undefined;

	afterEach(async () => {
		session?.dispose();
		if (projectDir !== undefined) {
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	it('marks closed sessions whose file differs from the saved workflow', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-snap-'));
		const store = new WorkflowSessionStore(projectDir);
		const saved = document('Saved');
		const shifted = document('Saved');
		await store.write(file('same', '2026-10-14 #1', saved));
		await store.write(
			file('moved', '2026-10-14 #2', {
				...shifted,
				graph: {
					...shifted.graph,
					viewport: { x: 40, y: 10, scale: 1.2 },
				},
			}),
		);
		await store.write(file('edited', '2026-10-14 #3', document('Edited')));

		session = new LangflowerSession();
		session.activeWorkflowId = 'wf-1';
		session.savedWorkflowDocument = saved;
		session.binding = { kind: 'workflow' };

		const snapshots = await readWorkflowSessionSnapshots(session, store);
		const flags = Object.fromEntries(
			snapshots.list.sessions.map((row) => [
				row.sessionId,
				row.differsFromWorkflow === true,
			]),
		);

		expect(flags).toEqual({
			same: false,
			moved: false,
			edited: true,
		});
	});
});
