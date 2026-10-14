import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import type { RunId } from '@langflower/runtime';
import type { WorkflowLoadedPayload } from '@langflower/shared/types/langflower-workflow.js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LangflowerSession } from '../session/langflower-session.js';
import type { ResolveNodeDefinition } from '../workflow/workflow-document.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import {
	bindLatestWorkflowSession,
	createWorkflowSession,
	deleteWorkflowSession,
	ensureSessionForRun,
	resetWorkflowSessionConversation,
	selectWorkflowSession,
	type WorkflowSessionActionDeps,
} from './workflow-session-actions.js';
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

describe('workflow session actions', () => {
	let projectDir: string | undefined;
	let session: LangflowerSession | undefined;

	afterEach(async () => {
		session?.dispose();
		if (projectDir !== undefined) {
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	it('refuses a dirty workflow and stores the saved file', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-act-'));
		const workflowService = new WorkflowService(
			projectDir,
			resolveDefinition,
		);
		const store = new WorkflowSessionStore(projectDir);
		session = new LangflowerSession();
		const autosave = new WorkflowSessionAutosave(session, store);
		session.attachWorkflowSessionAutosave(autosave);
		await workflowService.save(document('on-disk'));

		session.activeWorkflow = document('in-memory');
		session.activeWorkflowId = 'demo';
		session.currentStatus = 'dirty';
		const deps = {
			session,
			store,
			workflowService,
			resolveDefinition,
			autosave,
			now: () => new Date(2026, 9, 14, 12, 0, 0),
		};

		const refused = await createWorkflowSession(deps);
		expect(refused.ok).toBe(false);
		if (!refused.ok) {
			expect(refused.code).toBe('DIRTY_WORKFLOW');
		}
		expect((await store.list('demo')).value).toEqual([]);

		session.currentStatus = 'pristine';
		const created = await createWorkflowSession(deps);
		expect(created.ok).toBe(true);
		expect(session.binding.kind).toBe('workflowSession');
		expect(session.currentStatus).toBe('pristine');
		expect(session.activeWorkflow?.graph.nodes[0]?.inputs.value).toBe(
			'on-disk',
		);

		const listed = await store.list('demo');
		expect(listed.ok).toBe(true);
		if (!listed.ok || listed.value[0] === undefined) {
			return;
		}
		expect(listed.value[0].label).toBe('2026-10-14 #1');
		const saved = await store.read('demo', listed.value[0].sessionId);
		expect(saved.ok).toBe(true);
		if (saved.ok) {
			expect(
				saved.value.workflowSnapshot.graph.nodes[0]?.inputs.value,
			).toBe('on-disk');
			expect(saved.value.nodeStates).toEqual({});
			expect(saved.value.headOffset).toBeNull();
			expect(saved.value.points).toEqual([]);
		}

		const before = await fs.readFile(
			path.join(
				projectDir,
				'.langflower',
				'sessions',
				'demo',
				`${saved.ok ? saved.value.label : ''}.json`,
			),
			'utf8',
		);
		session.binding = { kind: 'workflow' };
		const selected = await selectWorkflowSession(
			deps,
			listed.value[0].sessionId,
		);
		expect(selected.ok).toBe(true);
		const after = await fs.readFile(
			path.join(
				projectDir,
				'.langflower',
				'sessions',
				'demo',
				`${saved.ok ? saved.value.label : ''}.json`,
			),
			'utf8',
		);
		expect(after).toBe(before);
	});

	const openDirtyCanvas = async (): Promise<{
		readonly store: WorkflowSessionStore;
		readonly deps: WorkflowSessionActionDeps;
		readonly workflowPath: string;
	}> => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-act-'));
		const workflowService = new WorkflowService(
			projectDir,
			resolveDefinition,
		);
		const store = new WorkflowSessionStore(projectDir);
		session = new LangflowerSession();
		const autosave = new WorkflowSessionAutosave(session, store);
		session.attachWorkflowSessionAutosave(autosave);
		await workflowService.save(document('on-disk'));
		session.activeWorkflow = document('in-memory');
		session.activeWorkflowId = 'demo';
		session.savedWorkflowDocument = document('on-disk');
		session.currentStatus = 'dirty';
		return {
			store,
			workflowPath: path.join(
				projectDir,
				'.langflower',
				'workflows',
				'demo.json',
			),
			deps: {
				session,
				store,
				workflowService,
				resolveDefinition,
				autosave,
				now: () => new Date(2026, 9, 14, 12, 0, 0),
			},
		};
	};

	it('snapshots the graph on screen and does not write the workflow file', async () => {
		const { store, deps, workflowPath } = await openDirtyCanvas();
		const before = await fs.readFile(workflowPath, 'utf8');

		const ensured = await ensureSessionForRun(deps);

		expect(ensured.ok).toBe(true);
		expect(session?.binding.kind).toBe('workflowSession');
		expect(session?.currentStatus).toBe('pristine');
		expect(session?.headNodeStates).toEqual({});
		expect(
			session?.savedWorkflowDocument?.graph.nodes[0]?.inputs.value,
		).toBe('on-disk');
		expect(session?.activeWorkflow?.graph.nodes[0]?.inputs.value).toBe(
			'in-memory',
		);
		expect(await fs.readFile(workflowPath, 'utf8')).toBe(before);

		const listed = await store.list('demo');
		expect(listed.value).toHaveLength(1);
		const saved = await store.read('demo', listed.value[0]!.sessionId);
		expect(saved.ok).toBe(true);
		if (saved.ok) {
			expect(
				saved.value.workflowSnapshot.graph.nodes[0]?.inputs.value,
			).toBe('in-memory');
			expect(saved.value.nodeStates).toEqual({});
			expect(saved.value.headOffset).toBeNull();
		}

		const again = await ensureSessionForRun(deps);
		expect(again.ok).toBe(true);
		expect((await store.list('demo')).value).toHaveLength(1);
	});

	it('clears the conversation and keeps the session graph', async () => {
		const { store, deps } = await openDirtyCanvas();
		const ensured = await ensureSessionForRun(deps);
		expect(ensured.ok).toBe(true);
		if (session?.binding.kind !== 'workflowSession') {
			throw new Error('expected a bound session');
		}
		const sessionId = session.binding.sessionId;
		await store.update('demo', sessionId, (current) => ({
			...current,
			nodeStates: { helper: { history: ['turn'] } },
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
		}));
		await store.appendFeed(
			'demo',
			sessionId,
			`${JSON.stringify({ kind: 'run', runId: 'run-1', workflowId: 'demo' })}\n`,
		);
		session.headNodeStates = { helper: { history: ['turn'] } };
		session.boundFeedSnapshot = {
			runId: 'run-1' as RunId,
			workflowId: 'demo',
			status: 'running',
			events: [],
		};
		session.runId = 'run-1' as RunId;

		session.runnerStatus = 'running';
		const refused = await resetWorkflowSessionConversation(deps, sessionId);
		expect(refused).toEqual({
			ok: false,
			code: 'RUN_ACTIVE',
			message: 'Cannot change workflow sessions while a run is active',
		});

		session.runnerStatus = 'idle';
		const reset = await resetWorkflowSessionConversation(deps, sessionId);
		expect(reset).toEqual({
			ok: true,
			canvasChanged: false,
			feedChanged: true,
		});
		expect(session.headNodeStates).toEqual({});
		expect(session.boundFeedSnapshot).toBeNull();
		expect(session.buildExecutionFeed()).toBeNull();

		const saved = await store.read('demo', sessionId);
		expect(saved.ok).toBe(true);
		if (saved.ok) {
			expect(
				saved.value.workflowSnapshot.graph.nodes[0]?.inputs.value,
			).toBe('in-memory');
			expect(saved.value.label).toBe('2026-10-14 #1');
			expect(saved.value.nodeStates).toEqual({});
			expect(saved.value.headOffset).toBeNull();
			expect(saved.value.points).toEqual([]);
		}
		const feed = await store.readFeedHead('demo', sessionId);
		expect(feed.ok).toBe(true);
		if (feed.ok) {
			expect(feed.value.snapshot).toBeNull();
			expect(feed.value.size).toBe(0);
		}
	});

	it('does not bind when the session file cannot be written', async () => {
		const { deps } = await openDirtyCanvas();
		session!.activeWorkflow = {
			...document('in-memory'),
			workflowId: 'bad/id',
		};

		const ensured = await ensureSessionForRun(deps);

		expect(ensured.ok).toBe(false);
		if (!ensured.ok) {
			expect(ensured.code).toBe('WRITE_FAILED');
		}
		expect(session?.binding).toEqual({ kind: 'workflow' });
		expect(session?.runnerStatus).not.toBe('running');
	});

	it('binds the newest non-corrupt session and leaves the workflow home unbound', async () => {
		const { store, deps } = await openDirtyCanvas();
		session!.currentStatus = 'pristine';
		session!.activeWorkflow = document('on-disk');
		const older = crypto.randomUUID();
		const newer = crypto.randomUUID();
		const base = {
			schemaVersion: 1 as const,
			workflowId: 'demo',
			localDay: '2026-10-14',
			ordinal: 1,
			createdAt: '2026-10-14T00:00:00.000Z',
			workflowSnapshot: document('session-graph'),
			nodeStates: {},
			headOffset: null,
			points: [],
		};
		await store.write({
			...base,
			sessionId: older,
			label: '2026-10-14 #1',
			updatedAt: '2026-10-14T01:00:00.000Z',
		});
		await store.write({
			...base,
			sessionId: newer,
			label: '2026-10-14 #2',
			ordinal: 2,
			updatedAt: '2026-10-14T02:00:00.000Z',
		});
		await fs.writeFile(
			path.join(
				projectDir!,
				'.langflower',
				'sessions',
				'demo',
				`${crypto.randomUUID()}.json`,
			),
			'{',
		);

		const bound = await bindLatestWorkflowSession(deps);

		expect(bound.ok).toBe(true);
		expect(session?.binding).toEqual({
			kind: 'workflowSession',
			sessionId: newer,
		});
		expect(session?.activeWorkflow?.graph.nodes[0]?.inputs.value).toBe(
			'session-graph',
		);

		const left = await selectWorkflowSession(deps, null);
		expect(left.ok).toBe(true);
		expect(session?.binding).toEqual({ kind: 'workflow' });
	});

	it('stays on the workflow file when every session file is corrupt', async () => {
		const { deps } = await openDirtyCanvas();
		await fs.mkdir(
			path.join(projectDir!, '.langflower', 'sessions', 'demo'),
			{ recursive: true },
		);
		await fs.writeFile(
			path.join(
				projectDir!,
				'.langflower',
				'sessions',
				'demo',
				`${crypto.randomUUID()}.json`,
			),
			'{',
		);

		const stayed = await bindLatestWorkflowSession(deps);

		expect(stayed.ok).toBe(true);
		expect(session?.binding).toEqual({ kind: 'workflow' });
	});

	it('assigns distinct labels when two creates overlap', async () => {
		const { store, deps } = await openDirtyCanvas();
		session!.currentStatus = 'pristine';

		const [first, second] = await Promise.all([
			createWorkflowSession(deps),
			createWorkflowSession(deps),
		]);

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		const listed = await store.list('demo');
		expect(listed.ok).toBe(true);
		if (!listed.ok) {
			return;
		}
		expect(listed.value.map((row) => row.label).sort()).toEqual([
			'2026-10-14 #1',
			'2026-10-14 #2',
		]);
	});

	it('deletes a session that is not bound, including a corrupt file', async () => {
		const { store, deps } = await openDirtyCanvas();
		session!.currentStatus = 'pristine';
		expect((await createWorkflowSession(deps)).ok).toBe(true);
		expect((await createWorkflowSession(deps)).ok).toBe(true);
		const boundId =
			session!.binding.kind === 'workflowSession'
				? session!.binding.sessionId
				: '';
		const listed = await store.list('demo');
		expect(listed.ok).toBe(true);
		if (!listed.ok) {
			return;
		}
		const inactive = listed.value.find((row) => row.sessionId !== boundId);
		expect(inactive).toBeDefined();

		const removed = await deleteWorkflowSession(deps, inactive!.sessionId);

		expect(removed).toEqual({
			ok: true,
			canvasChanged: false,
			feedChanged: false,
		});
		expect(session!.binding).toEqual({
			kind: 'workflowSession',
			sessionId: boundId,
		});

		const dir = path.join(projectDir!, '.langflower', 'sessions', 'demo');
		await fs.writeFile(path.join(dir, '2026-10-14 #9.json'), '{', 'utf8');
		const corrupt = await deleteWorkflowSession(deps, '2026-10-14 #9');
		expect(corrupt.ok).toBe(true);
		expect(session!.binding).toEqual({
			kind: 'workflowSession',
			sessionId: boundId,
		});
		await expect(
			fs.access(path.join(dir, '2026-10-14 #9.json')),
		).rejects.toThrow();
	});

	it('binds one session when two runs ensure together', async () => {
		const { store, deps } = await openDirtyCanvas();

		const [first, second] = await Promise.all([
			ensureSessionForRun(deps),
			ensureSessionForRun(deps),
		]);

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		expect((await store.list('demo')).value).toHaveLength(1);
	});
});
