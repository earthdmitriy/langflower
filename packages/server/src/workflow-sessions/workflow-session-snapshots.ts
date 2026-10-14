import { buildWorkflowFingerprint } from '@langflower/shared/checkpoint/workflow-fingerprint.js';
import { isSameWorkflowDocument } from '@langflower/shared/workflow/is-same-workflow-document.js';
import type {
	WorkflowSessionCurrentSnapshotPayload,
	WorkflowSessionListSnapshotPayload,
	WorkflowSessionPointSummary,
} from '@langflower/shared/types/workflow-session.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import type { WorkflowSessionStore } from './workflow-session-store.js';

const markSessionsThatDiffer = async (
	store: WorkflowSessionStore,
	workflowId: string,
	sessions: WorkflowSessionListSnapshotPayload['sessions'],
	saved: LangflowerSession['savedWorkflowDocument'],
): Promise<WorkflowSessionListSnapshotPayload['sessions']> => {
	if (saved === null || sessions.length === 0) {
		return sessions;
	}

	return Promise.all(
		sessions.map(async (row) => {
			if (row.corrupt === true) {
				return row;
			}

			const loaded = await store.read(workflowId, row.sessionId);

			if (
				!loaded.ok ||
				isSameWorkflowDocument(loaded.value.workflowSnapshot, saved)
			) {
				return row;
			}

			return { ...row, differsFromWorkflow: true as const };
		}),
	);
};

const sessionDiffersFromWorkflow = (session: LangflowerSession): boolean => {
	if (session.binding.kind !== 'workflowSession') {
		return false;
	}

	const snapshot = session.activeWorkflow;
	const saved = session.savedWorkflowDocument;

	if (snapshot === null || saved === null) {
		return false;
	}

	return !isSameWorkflowDocument(snapshot, saved);
};

const pointSummaries = (
	session: LangflowerSession,
	points: readonly {
		readonly pointId: string;
		readonly label?: string;
		readonly createdAt: string;
		readonly workflowFingerprint: string;
		readonly unsupported?: string;
	}[],
): readonly WorkflowSessionPointSummary[] => {
	const active = session.activeWorkflow;
	const fingerprint =
		active === null
			? undefined
			: buildWorkflowFingerprint(active.graph.nodes, active.graph.edges);

	return points.map((point) => {
		const stale =
			fingerprint !== undefined &&
			point.workflowFingerprint !== fingerprint;

		return {
			pointId: point.pointId,
			createdAt: point.createdAt,
			...(point.label !== undefined ? { label: point.label } : {}),
			...(stale ? { stale: true as const } : {}),
			...(point.unsupported !== undefined
				? { unsupported: point.unsupported }
				: {}),
		};
	});
};

export const readWorkflowSessionSnapshots = async (
	session: LangflowerSession,
	store: WorkflowSessionStore,
): Promise<{
	readonly list: WorkflowSessionListSnapshotPayload;
	readonly current: WorkflowSessionCurrentSnapshotPayload;
}> => {
	const workflowId = session.activeWorkflowId ?? '';
	const listed =
		workflowId.length === 0
			? { ok: true as const, value: [] }
			: await store.list(workflowId);
	const sessions = listed.ok
		? await markSessionsThatDiffer(
				store,
				workflowId,
				listed.value,
				session.savedWorkflowDocument,
			)
		: [];
	const list: WorkflowSessionListSnapshotPayload = {
		workflowId,
		sessions,
	};

	if (session.binding.kind !== 'workflowSession' || workflowId.length === 0) {
		return {
			list,
			current: {
				workflowId,
				sessionId: null,
				differsFromWorkflow: false,
				points: [],
			},
		};
	}

	const loaded = await store.read(workflowId, session.binding.sessionId);
	const points = loaded.ok
		? pointSummaries(session, loaded.value.points)
		: [];

	return {
		list,
		current: {
			workflowId,
			sessionId: session.binding.sessionId,
			differsFromWorkflow: sessionDiffersFromWorkflow(session),
			points,
		},
	};
};
