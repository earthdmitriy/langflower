import type { NodeId, RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import { buildWorkflowFingerprint } from '@langflower/shared/checkpoint/workflow-fingerprint.js';
import type {
	WorkflowSessionFile,
	WorkflowSessionPoint,
} from '@langflower/shared/types/workflow-session.js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunProgress } from '../checkpoint/run-progress-accumulator.js';
import { LangflowerSession } from '../session/langflower-session.js';
import { WorkflowSessionAutosave } from './workflow-session-autosave.js';
import {
	appendWorkflowSessionPoint,
	applyPointToSessionHead,
	applyWorkflowSessionNodeState,
	createWorkflowSessionHeadFlush,
	decidePointResume,
	flushWorkflowSessionHead,
	isNonStreamingPortEvent,
} from './workflow-session-run.js';
import { WorkflowSessionStore } from './workflow-session-store.js';

const file = (): WorkflowSessionFile => ({
	schemaVersion: 1,
	sessionId: 'session-1',
	workflowId: 'demo',
	label: '2026-10-14 #1',
	localDay: '2026-10-14',
	ordinal: 1,
	createdAt: '2026-10-14T00:00:00.000Z',
	updatedAt: '2026-10-14T00:00:00.000Z',
	workflowSnapshot: {
		workflowId: 'demo',
		metadata: {
			name: 'Demo',
			createdAt: '2026-10-14T00:00:00.000Z',
			updatedAt: '2026-10-14T00:00:00.000Z',
		},
		graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
	},
	nodeStates: { n1: { history: ['kept'] } },
	headOffset: null,
	points: [],
});

const port = (
	feed: { readonly streaming?: boolean; readonly role?: string } | null,
): RuntimeRunnerEvent => [
	'out',
	'helper' as NodeId,
	'response',
	{ value: 'ok' },
	0,
	[],
	feed,
];

describe('workflow session run head', () => {
	let projectDir: string | undefined;
	let session: LangflowerSession | undefined;

	afterEach(async () => {
		vi.useRealTimers();
		session?.dispose();
		if (projectDir !== undefined) {
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	it('writes nothing when no session is bound', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-run-'));
		const store = new WorkflowSessionStore(projectDir);
		session = new LangflowerSession();
		session.activeWorkflowId = 'demo';
		session.runId = 'run-1' as RunId;
		const autosave = new WorkflowSessionAutosave(session, store);

		applyWorkflowSessionNodeState(session, {
			nodeId: 'n1',
			state: { history: ['nope'] },
		});
		await flushWorkflowSessionHead(session, store, autosave);

		await expect(
			fs.access(path.join(projectDir, '.langflower', 'sessions')),
		).rejects.toThrow();
		expect(session.headNodeStates).toEqual({});
	});

	it('keeps the previous head when a state is not JSON', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-run-'));
		const store = new WorkflowSessionStore(projectDir);
		await store.write(file());
		session = new LangflowerSession();
		session.binding = { kind: 'workflowSession', sessionId: 'session-1' };
		session.activeWorkflow = file().workflowSnapshot;
		session.activeWorkflowId = 'demo';
		session.headNodeStates = { n1: { history: ['kept'] } };
		session.runId = 'run-1' as RunId;
		const autosave = new WorkflowSessionAutosave(session, store);

		applyWorkflowSessionNodeState(session, {
			nodeId: 'n1',
			state: Number.NaN,
		});
		expect(session.headNodeStates.n1).toEqual({ history: ['kept'] });

		await flushWorkflowSessionHead(session, store, autosave);
		const saved = await store.read('demo', 'session-1');
		expect(saved.ok).toBe(true);
		if (saved.ok) {
			expect(saved.value.nodeStates).toEqual({
				n1: { history: ['kept'] },
			});
		}
		const feed = await store.readFeedHead('demo', 'session-1');
		expect(feed.ok).toBe(true);
		if (feed.ok) {
			expect(feed.value.snapshot?.runId).toBe('run-1');
		}
	});

	it('does not treat streaming frames or runner.done as a head flush', () => {
		expect(
			isNonStreamingPortEvent(
				port({ streaming: true, role: 'reasoning' }),
			),
		).toBe(false);
		expect(
			isNonStreamingPortEvent(port({ streaming: true, role: 'tool' })),
		).toBe(false);
		expect(
			isNonStreamingPortEvent(port({ streaming: true, role: 'draft' })),
		).toBe(false);
		expect(isNonStreamingPortEvent(['done', 'run-1' as RunId])).toBe(false);
		expect(isNonStreamingPortEvent(port({ role: 'result' }))).toBe(true);
		expect(isNonStreamingPortEvent(port(null))).toBe(true);
	});

	const bindHead = async (): Promise<{
		readonly store: WorkflowSessionStore;
		readonly autosave: WorkflowSessionAutosave;
		readonly bound: LangflowerSession;
	}> => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-run-'));
		const store = new WorkflowSessionStore(projectDir);
		await store.write(file());
		const bound = new LangflowerSession();
		session = bound;
		bound.binding = { kind: 'workflowSession', sessionId: 'session-1' };
		bound.activeWorkflow = file().workflowSnapshot;
		bound.activeWorkflowId = 'demo';
		bound.headNodeStates = { helper: { history: ['turn'] } };
		bound.runId = 'run-1' as RunId;
		return {
			store,
			bound,
			autosave: new WorkflowSessionAutosave(bound, store),
		};
	};

	it('writes the head once after a burst of settled ports', async () => {
		vi.useFakeTimers();
		const { store, autosave, bound } = await bindHead();
		const update = vi.spyOn(store, 'update');
		const headFlush = createWorkflowSessionHeadFlush(
			bound,
			store,
			autosave,
		);

		headFlush.schedule();
		bound.headNodeStates = { helper: { history: ['turn', 'next'] } };
		headFlush.schedule();
		await vi.advanceTimersByTimeAsync(999);
		expect(update).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		vi.useRealTimers();
		await vi.waitFor(() => {
			expect(update).toHaveBeenCalledTimes(1);
		});

		const saved = await store.read('demo', 'session-1');
		expect(saved.ok).toBe(true);
		if (saved.ok) {
			expect(saved.value.nodeStates).toEqual({
				helper: { history: ['turn', 'next'] },
			});
		}
		const feed = await store.readFeedHead('demo', 'session-1');
		expect(feed.ok).toBe(true);
		if (feed.ok) {
			expect(feed.value.snapshot?.runId).toBe('run-1');
		}
	});

	it('flushes immediately on stop and cancels the pending debounce', async () => {
		vi.useFakeTimers();
		const { store, autosave, bound } = await bindHead();
		const update = vi.spyOn(store, 'update');
		const headFlush = createWorkflowSessionHeadFlush(
			bound,
			store,
			autosave,
		);

		headFlush.schedule();
		await headFlush.flushNow();
		expect(update).toHaveBeenCalledTimes(1);

		const saved = await store.read('demo', 'session-1');
		expect(saved.ok).toBe(true);
		if (saved.ok) {
			expect(saved.value.nodeStates).toEqual({
				helper: { history: ['turn'] },
			});
		}
		const feed = await store.readFeedHead('demo', 'session-1');
		expect(feed.ok).toBe(true);
		if (feed.ok) {
			expect(feed.value.snapshot?.runId).toBe('run-1');
		}

		update.mockClear();
		await vi.advanceTimersByTimeAsync(1000);
		expect(update).not.toHaveBeenCalled();
	});

	it('appends closed frames without rewriting earlier lines', async () => {
		const { store, autosave, bound } = await bindHead();
		const firstEvent = port({ role: 'result' });
		bound.runtime.runner.seedEventLog([firstEvent]);
		await flushWorkflowSessionHead(bound, store, autosave);
		const feedPath = path.join(
			projectDir ?? '',
			'.langflower',
			'sessions',
			'demo',
			'2026-10-14 #1.feed.jsonl',
		);
		const first = await fs.readFile(feedPath, 'utf8');

		bound.runtime.runner.seedEventLog([firstEvent, port(null)]);
		await flushWorkflowSessionHead(bound, store, autosave);
		const second = await fs.readFile(feedPath, 'utf8');

		expect(second.startsWith(first)).toBe(true);
		expect(second.length).toBeGreaterThan(first.length);
	});
});

const progress = (label: string, unsupported?: string): RunProgress => ({
	runId: 'run-1',
	completedNodeIds: ['checkpoint-a'],
	outputSnapshots: {
		'checkpoint-a': {
			value: { state: 'value', value: 'ok' },
		},
	},
	label,
	...(unsupported !== undefined ? { unsupported } : {}),
});

const samplePoint = (
	overrides: Partial<WorkflowSessionPoint> = {},
): WorkflowSessionPoint => ({
	pointId: 'point-1',
	runId: 'run-1',
	createdAt: '2026-10-14T00:00:00.000Z',
	workflowFingerprint: 'fp',
	completedNodeIds: ['checkpoint-a'],
	outputSnapshots: {},
	nodeStates: { n1: { history: ['kept'] } },
	runOffset: 0,
	feedOffset: 0,
	...overrides,
});

describe('workflow session points', () => {
	let projectDir: string | undefined;
	let session: LangflowerSession | undefined;

	afterEach(async () => {
		session?.dispose();
		if (projectDir !== undefined) {
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	const bind = async (): Promise<{
		readonly store: WorkflowSessionStore;
		readonly bound: LangflowerSession;
	}> => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-point-'));
		const store = new WorkflowSessionStore(projectDir);
		await store.write(file());
		const bound = new LangflowerSession();
		session = bound;
		bound.binding = { kind: 'workflowSession', sessionId: 'session-1' };
		bound.activeWorkflow = file().workflowSnapshot;
		bound.activeWorkflowId = 'demo';
		bound.headNodeStates = { n1: { history: ['kept'] } };
		bound.runId = 'run-1' as RunId;
		return { store, bound };
	};

	it('writes nothing when no session is bound', async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-sess-point-'));
		const store = new WorkflowSessionStore(projectDir);
		session = new LangflowerSession();
		session.activeWorkflow = file().workflowSnapshot;
		session.activeWorkflowId = 'demo';
		session.runId = 'run-1' as RunId;

		const result = await appendWorkflowSessionPoint(
			session,
			store,
			progress('After'),
		);

		expect(result).toEqual({ ok: true, appended: false });
		await expect(
			fs.access(path.join(projectDir, '.langflower', 'sessions')),
		).rejects.toThrow();
		await expect(
			fs.access(path.join(projectDir, '.langflower', 'runs')),
		).rejects.toThrow();
	});

	it('appends an immutable point and does not rewrite it', async () => {
		const { store, bound } = await bind();
		const first = await appendWorkflowSessionPoint(
			bound,
			store,
			progress('After stage A'),
		);
		expect(first).toEqual({ ok: true, appended: true });

		const saved = await store.read('demo', 'session-1');
		expect(saved.ok).toBe(true);
		if (!saved.ok) {
			return;
		}

		const original = saved.value.points[0];
		expect(original?.label).toBe('After stage A');
		expect(original?.nodeStates).toEqual({ n1: { history: ['kept'] } });
		expect(original?.runOffset).toBe(0);
		expect(original?.workflowFingerprint).toBe(
			buildWorkflowFingerprint(
				file().workflowSnapshot.graph.nodes,
				file().workflowSnapshot.graph.edges,
			),
		);

		bound.headNodeStates = { n1: { history: ['later'] } };
		const second = await appendWorkflowSessionPoint(
			bound,
			store,
			progress('After stage B'),
		);
		expect(second).toEqual({ ok: true, appended: true });

		const again = await store.read('demo', 'session-1');
		expect(again.ok).toBe(true);
		if (!again.ok) {
			return;
		}

		expect(again.value.points).toHaveLength(2);
		expect(again.value.points[0]).toEqual(original);
		expect(again.value.points[1]?.label).toBe('After stage B');
		expect(again.value.points[1]?.nodeStates).toEqual({
			n1: { history: ['later'] },
		});
	});

	it('stores unsupported and refuses Continue for that point', async () => {
		const { store, bound } = await bind();
		await appendWorkflowSessionPoint(
			bound,
			store,
			progress('After', 'stage-a.value'),
		);
		const saved = await store.read('demo', 'session-1');
		expect(saved.ok).toBe(true);
		if (!saved.ok) {
			return;
		}

		const point = saved.value.points[0];
		expect(point?.unsupported).toBe('stage-a.value');
		expect(
			decidePointResume({
				busy: false,
				bound: true,
				corrupt: false,
				point,
				currentFingerprint: point?.workflowFingerprint ?? '',
			}),
		).toMatchObject({
			ok: false,
			code: 'UNSUPPORTED_VALUE',
		});
	});

	it('rewinds the head to the point without rewriting points', async () => {
		const { store, bound } = await bind();
		await appendWorkflowSessionPoint(
			bound,
			store,
			progress('After stage A'),
		);
		const saved = await store.read('demo', 'session-1');
		if (!saved.ok) {
			throw new Error('expected session');
		}

		const point = saved.value.points[0];
		if (point === undefined) {
			throw new Error('expected point');
		}

		bound.headNodeStates = { n1: { history: ['later'] } };
		await applyPointToSessionHead(bound, store, point);

		const again = await store.read('demo', 'session-1');
		expect(again.ok).toBe(true);
		if (!again.ok) {
			return;
		}

		expect(again.value.points).toEqual([point]);
		expect(again.value.nodeStates).toEqual(point.nodeStates);
		const slice = await store.readFeedSlice(
			'demo',
			'session-1',
			point.runOffset,
			point.feedOffset,
		);
		expect(slice.ok).toBe(true);
		if (slice.ok) {
			expect(slice.value?.runId).toBe('run-1');
		}
		expect(bound.headNodeStates).toEqual(point.nodeStates);
	});
});

describe('decidePointResume', () => {
	const fingerprint = 'fp-current';
	const point = samplePoint({ workflowFingerprint: fingerprint });

	it('refuses a busy run, a missing session, and a corrupt file', () => {
		expect(
			decidePointResume({
				busy: true,
				bound: true,
				corrupt: false,
				point,
				currentFingerprint: fingerprint,
			}),
		).toMatchObject({ ok: false, code: 'BUSY' });
		expect(
			decidePointResume({
				busy: false,
				bound: false,
				corrupt: false,
				point: undefined,
				currentFingerprint: fingerprint,
			}),
		).toMatchObject({ ok: false, code: 'NO_SESSION' });
		expect(
			decidePointResume({
				busy: false,
				bound: true,
				corrupt: true,
				corruptMessage: 'Session JSON is not parseable',
				point: undefined,
				currentFingerprint: fingerprint,
			}),
		).toEqual({
			ok: false,
			code: 'CORRUPT',
			message: 'Session JSON is not parseable',
		});
	});

	it('refuses a missing point and a stale fingerprint', () => {
		expect(
			decidePointResume({
				busy: false,
				bound: true,
				corrupt: false,
				point: undefined,
				currentFingerprint: fingerprint,
			}),
		).toMatchObject({ ok: false, code: 'NOT_FOUND' });
		expect(
			decidePointResume({
				busy: false,
				bound: true,
				corrupt: false,
				point,
				currentFingerprint: 'other',
			}),
		).toMatchObject({ ok: false, code: 'POINT_STALE' });
	});

	it('accepts a matching point', () => {
		expect(
			decidePointResume({
				busy: false,
				bound: true,
				corrupt: false,
				point,
				currentFingerprint: fingerprint,
			}),
		).toEqual({ ok: true, point });
	});
});
