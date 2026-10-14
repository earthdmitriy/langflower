import { describe, expect, expectTypeOf, it } from 'vitest';
import { langflowerWsConfig } from '../langflower-bus-config.js';
import type { WorkflowLoadedPayload } from './langflower-workflow.js';
import type {
	WorkflowSessionCurrentSnapshotPayload,
	WorkflowSessionFile,
	WorkflowSessionOutputSnapshots,
	WorkflowSessionPoint,
	WorkflowSessionPortSnapshot,
	WorkflowSessionResumeFailedCode,
	WorkflowSessionResumeRequestedPayload,
	WorkflowSessionSelectRequestedPayload,
	WorkflowSessionSummary,
} from './workflow-session.js';

const workflow = {
	workflowId: 'wf',
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
} satisfies WorkflowLoadedPayload;

const point = {
	pointId: 'point-1',
	runId: 'run-1',
	createdAt: '2026-10-14T00:00:00.000Z',
	workflowFingerprint: 'fp',
	completedNodeIds: ['n1'],
	outputSnapshots: {},
	nodeStates: { n1: { history: [] } },
	runOffset: 0,
	feedOffset: 0,
} satisfies WorkflowSessionPoint;

const session = {
	schemaVersion: 1,
	sessionId: 'session-1',
	workflowId: 'wf',
	label: '2026-10-14 #1',
	localDay: '2026-10-14',
	ordinal: 1,
	createdAt: '2026-10-14T00:00:00.000Z',
	updatedAt: '2026-10-14T00:00:00.000Z',
	workflowSnapshot: workflow,
	nodeStates: {},
	headOffset: null,
	points: [point],
} satisfies WorkflowSessionFile;

describe('workflow session contracts', () => {
	it('builds a schemaVersion 1 file without a point status', () => {
		expect(session.schemaVersion).toBe(1);
		expect(session.points[0]?.pointId).toBe('point-1');
		expectTypeOf<WorkflowSessionPoint>().not.toHaveProperty('status');
		expectTypeOf<WorkflowSessionFile['schemaVersion']>().toEqualTypeOf<1>();
	});

	it('stores port snapshots and resumes by pointId', () => {
		expectTypeOf<WorkflowSessionOutputSnapshots>().toEqualTypeOf<
			Readonly<
				Record<
					string,
					Readonly<Record<string, WorkflowSessionPortSnapshot>>
				>
			>
		>();
		expectTypeOf<WorkflowSessionResumeRequestedPayload>().toEqualTypeOf<{
			readonly pointId: string;
		}>();
		expectTypeOf<WorkflowSessionResumeFailedCode>().toEqualTypeOf<
			| 'CORRUPT'
			| 'UNSUPPORTED_VALUE'
			| 'POINT_STALE'
			| 'NOT_FOUND'
			| 'BUSY'
			| 'NO_SESSION'
		>();
		expectTypeOf(
			langflowerWsConfig.fromClientToServer['runner.resume.requested'],
		).toBeObject();
	});

	it('types summaries, select-null, and the new snapshot keys', () => {
		const corrupt = {
			sessionId: 'session-1',
			label: '2026-10-14 #1',
			updatedAt: '2026-10-14T00:00:00.000Z',
			corrupt: true,
		} satisfies WorkflowSessionSummary;
		const current = {
			workflowId: 'wf',
			sessionId: null,
			differsFromWorkflow: false,
			points: [
				{
					pointId: 'point-1',
					createdAt: corrupt.updatedAt,
					stale: true,
				},
			],
		} satisfies WorkflowSessionCurrentSnapshotPayload;
		const leave: WorkflowSessionSelectRequestedPayload = {
			sessionId: null,
		};

		expect(current.sessionId).toBe(leave.sessionId);
		expectTypeOf<WorkflowSessionSummary['corrupt']>().toEqualTypeOf<
			true | undefined
		>();

		expectTypeOf(langflowerWsConfig.fromClientToServer).toHaveProperty(
			'workflowSession.create.requested',
		);
		expectTypeOf(langflowerWsConfig.fromClientToServer).toHaveProperty(
			'workflowSession.select.requested',
		);
		expectTypeOf(langflowerWsConfig.fromClientToServer).toHaveProperty(
			'workflowSession.delete.requested',
		);
		expectTypeOf(langflowerWsConfig.fromClientToServer).toHaveProperty(
			'workflowSession.replaceSnapshotFromWorkflow.requested',
		);
		expectTypeOf(langflowerWsConfig.fromClientToServer).toHaveProperty(
			'workflowSession.writeSnapshotToWorkflow.requested',
		);
		expectTypeOf(langflowerWsConfig.fromClientToServer).toHaveProperty(
			'workflowSession.discardPoint.requested',
		);
		expectTypeOf(langflowerWsConfig.fromClientToServer).toHaveProperty(
			'workflowSession.resetConversation.requested',
		);
		expectTypeOf(langflowerWsConfig.fromClientToServer).toHaveProperty(
			'runner.resume.requested',
		);
		expectTypeOf(langflowerWsConfig.fromClientToServer).not.toHaveProperty(
			'runner.checkpoint.discard.requested',
		);
		expectTypeOf(langflowerWsConfig.fromServerToClient).toHaveProperty(
			'workflowSession.list.snapshot',
		);
		expectTypeOf(langflowerWsConfig.fromServerToClient).toHaveProperty(
			'workflowSession.current.snapshot',
		);
		expectTypeOf(langflowerWsConfig.fromServerToClient).toHaveProperty(
			'workflowSession.action.failed',
		);
		expectTypeOf(langflowerWsConfig.fromServerToClient).not.toHaveProperty(
			'runner.checkpoints.snapshot',
		);
		expectTypeOf(langflowerWsConfig.fromServerToClient).not.toHaveProperty(
			'runner.checkpointed',
		);
	});
});
