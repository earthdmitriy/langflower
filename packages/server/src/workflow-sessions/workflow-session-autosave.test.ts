import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import type { WorkflowSessionFile } from '@langflower/shared/types/workflow-session.js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LangflowerSession } from '../session/langflower-session.js';
import type { ResolveNodeDefinition } from '../workflow/workflow-document.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { WorkflowSessionAutosave } from './workflow-session-autosave.js';
import { WorkflowSessionStore } from './workflow-session-store.js';

const resolveDefinition: ResolveNodeDefinition = resolveWorkflowNodeDefinition;

const document = (value: string): WorkflowLoadedPayload => ({
	workflowId: 'demo',
	metadata: {
		name: 'Demo',
		createdAt: '2026-10-14T00:00:00.000Z',
		updatedAt: '2026-10-14T00:00:00.000Z',
	},
	graph: {
		viewport: { x: 0, y: 0, scale: 1 },
		nodes: [
			{
				id: 'string-1',
				type: 'common-string',
				params: {},
				inputs: { value },
				ui: { position: { x: 0, y: 0 } },
			},
		],
		edges: [],
	},
});

const sessionFile = (snapshot: WorkflowLoadedPayload): WorkflowSessionFile => ({
	schemaVersion: 1,
	sessionId: 'session-1',
	workflowId: 'demo',
	label: '2026-10-14 #1',
	localDay: '2026-10-14',
	ordinal: 1,
	createdAt: '2026-10-14T00:00:00.000Z',
	updatedAt: '2026-10-14T00:00:00.000Z',
	workflowSnapshot: snapshot,
	nodeStates: {},
	headOffset: null,
	points: [],
});

describe('WorkflowSessionAutosave', () => {
	let projectDir: string | undefined;
	let session: LangflowerSession | undefined;

	afterEach(async () => {
		vi.useRealTimers();
		session?.dispose();
		if (projectDir !== undefined) {
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	it('debounces edits and flush writes the snapshot once', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-save-'));
		const workflowService = new WorkflowService(
			projectDir,
			resolveDefinition,
		);
		await workflowService.save(document('on-disk'));
		const workflowPath = path.join(
			projectDir,
			'.langflower',
			'workflows',
			'demo.json',
		);
		const workflowBefore = await fs.readFile(workflowPath, 'utf8');

		const store = new WorkflowSessionStore(projectDir);
		await store.write(sessionFile(document('on-disk')));
		session = new LangflowerSession();
		const autosave = new WorkflowSessionAutosave(session, store);
		session.attachWorkflowSessionAutosave(autosave);
		session.binding = { kind: 'workflowSession', sessionId: 'session-1' };
		session.activeWorkflow = document('on-disk');
		session.activeWorkflowId = 'demo';
		session.savedWorkflowDocument = document('on-disk');

		const update = vi.spyOn(store, 'update');
		session.activeWorkflow = document('edited');
		session.markDirty();
		session.markDirty();
		session.markDirty();
		expect(update).not.toHaveBeenCalled();
		expect(session.currentStatus).toBe('pristine');

		await autosave.flush();
		expect(update).toHaveBeenCalledOnce();
		expect(session.currentStatus).toBe('pristine');
		expect(await fs.readFile(workflowPath, 'utf8')).toBe(workflowBefore);

		const saved = await store.read('demo', 'session-1');
		expect(saved.ok).toBe(true);
		if (saved.ok) {
			expect(
				saved.value.workflowSnapshot.graph.nodes[0]?.inputs.value,
			).toBe('edited');
		}

		vi.useFakeTimers();
		update.mockClear();
		session.activeWorkflow = document('later');
		session.markDirty();
		session.markDirty();
		await vi.advanceTimersByTimeAsync(999);
		expect(update).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(update).toHaveBeenCalledOnce();
		await update.mock.results[0]?.value;
	});
});
