/**
 * Field-based wait predicates for MCP action tools (ADR-024).
 * No bus `requestId` — correlate outbound payload fields to the next
 * matching broadcast. `undefined` = next broadcast wins.
 */

export type WaitPredicate = (event: unknown) => boolean;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const readStringField = (value: unknown, key: string): string | undefined => {
	if (!isRecord(value)) {
		return undefined;
	}
	const field = value[key];
	return typeof field === 'string' ? field : undefined;
};

const readOptionalRunIdAt = (
	payload: unknown,
	index: number,
): string | undefined => {
	if (!Array.isArray(payload)) {
		return undefined;
	}
	const value = payload[index];
	return typeof value === 'string' ? value : undefined;
};

const matchWorkflowCurrentId =
	(workflowId: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event)) {
			return false;
		}
		const active = event['activeWorkflow'];
		return (
			isRecord(active) &&
			typeof active['workflowId'] === 'string' &&
			active['workflowId'] === workflowId
		);
	};

const matchWorkflowDeletedFromList =
	(workflowId: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event) || !Array.isArray(event['workflows'])) {
			return false;
		}
		return !event['workflows'].some(
			(entry) =>
				isRecord(entry) &&
				typeof entry['workflowId'] === 'string' &&
				entry['workflowId'] === workflowId,
		);
	};

const matchCopyActiveWorkflow =
	(sourceWorkflowId: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event)) {
			return false;
		}
		const active = event['activeWorkflow'];
		if (!isRecord(active) || typeof active['workflowId'] !== 'string') {
			return false;
		}
		const id = active['workflowId'];
		return (
			id === `${sourceWorkflowId}-copy` ||
			id.startsWith(`${sourceWorkflowId}-copy-`)
		);
	};

const matchRenamedWorkflowName =
	(name: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event)) {
			return false;
		}
		const active = event['activeWorkflow'];
		if (!isRecord(active)) {
			return false;
		}
		const metadata = active['metadata'];
		return (
			isRecord(metadata) &&
			typeof metadata['name'] === 'string' &&
			metadata['name'] === name
		);
	};

const matchRunId =
	(expected: string): WaitPredicate =>
	(event) =>
		event === expected;

const matchHitlInputReceived =
	(nodeId: string, portId: string): WaitPredicate =>
	(event) =>
		Array.isArray(event) &&
		event[0] === 'in' &&
		event[1] === nodeId &&
		event[2] === portId;

const matchExecutionFeedCleared = (): WaitPredicate => (event) => {
	if (event === null) {
		return true;
	}
	if (!isRecord(event) || !Array.isArray(event['events'])) {
		return false;
	}
	return event['events'].length === 0;
};

const matchResumeFailed =
	(pointId: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event)) {
			return false;
		}
		const failedPointId = event['pointId'];
		return failedPointId === undefined || failedPointId === pointId;
	};

const matchCurrentSessionId =
	(sessionId: string | null): WaitPredicate =>
	(event) =>
		isRecord(event) && event['sessionId'] === sessionId;

const matchSessionAbsentFromList =
	(sessionId: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event) || !Array.isArray(event['sessions'])) {
			return false;
		}
		return !event['sessions'].some(
			(entry) => isRecord(entry) && entry['sessionId'] === sessionId,
		);
	};

const matchConversationReset =
	(sessionId: string): WaitPredicate =>
	(event) =>
		isRecord(event) &&
		event['sessionId'] === sessionId &&
		Array.isArray(event['points']) &&
		event['points'].length === 0;

const matchPointDiscarded =
	(sessionId: string, pointId: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event) || event['sessionId'] !== sessionId) {
			return false;
		}
		if (!Array.isArray(event['points'])) {
			return false;
		}
		return !event['points'].some(
			(entry) => isRecord(entry) && entry['pointId'] === pointId,
		);
	};

const matchLoadFailed =
	(workflowId: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event)) {
			return false;
		}
		const failedWorkflowId = event['workflowId'];
		return (
			failedWorkflowId === undefined || failedWorkflowId === workflowId
		);
	};

/**
 * Resolve a wait predicate for an action intent + outbound payload.
 * Returns `undefined` when the intent has nothing safe to correlate on
 * (next matching broadcast wins).
 */
export const resolveWaitPredicate = (
	intent: string,
	payload: unknown,
): WaitPredicate | undefined => {
	switch (intent) {
		case 'workflow.load.requested': {
			const workflowId = readStringField(payload, 'workflowId');
			return workflowId !== undefined
				? matchWorkflowCurrentId(workflowId)
				: undefined;
		}
		case 'workflow.delete.requested': {
			const workflowId = readStringField(payload, 'workflowId');
			return workflowId !== undefined
				? matchWorkflowDeletedFromList(workflowId)
				: undefined;
		}
		case 'workflow.copy.requested': {
			const workflowId = readStringField(payload, 'workflowId');
			return workflowId !== undefined
				? matchCopyActiveWorkflow(workflowId)
				: undefined;
		}
		case 'workflow.renameCurrent.requested': {
			const name = readStringField(payload, 'name')?.trim();
			return name !== undefined && name.length > 0
				? matchRenamedWorkflowName(name)
				: undefined;
		}
		case 'runner.start.requested': {
			const runId = readOptionalRunIdAt(payload, 1);
			return runId !== undefined ? matchRunId(runId) : undefined;
		}
		case 'runner.startNode.requested': {
			const runId = readOptionalRunIdAt(payload, 2);
			return runId !== undefined ? matchRunId(runId) : undefined;
		}
		case 'runner.hitl.event': {
			const nodeId = readStringField(payload, 'nodeId');
			const portId = readStringField(payload, 'portId');
			return nodeId !== undefined && portId !== undefined
				? matchHitlInputReceived(nodeId, portId)
				: undefined;
		}
		case 'workflowSession.select.requested':
		case 'workflowSession.replaceSnapshotFromWorkflow.requested':
		case 'workflowSession.writeSnapshotToWorkflow.requested': {
			if (!isRecord(payload)) {
				return undefined;
			}
			const sessionId = payload['sessionId'];
			if (sessionId === null || typeof sessionId === 'string') {
				return matchCurrentSessionId(sessionId);
			}
			return undefined;
		}
		case 'workflowSession.delete.requested': {
			const sessionId = readStringField(payload, 'sessionId');
			return sessionId !== undefined
				? matchSessionAbsentFromList(sessionId)
				: undefined;
		}
		case 'workflowSession.resetConversation.requested': {
			const sessionId = readStringField(payload, 'sessionId');
			return sessionId !== undefined
				? matchConversationReset(sessionId)
				: undefined;
		}
		case 'workflowSession.discardPoint.requested': {
			const sessionId = readStringField(payload, 'sessionId');
			const pointId = readStringField(payload, 'pointId');
			return sessionId !== undefined && pointId !== undefined
				? matchPointDiscarded(sessionId, pointId)
				: undefined;
		}
		case 'runner.executionFeed.clear.requested':
			return matchExecutionFeedCleared();
		case 'runner.resume.requested':
			return undefined;
		default:
			return undefined;
	}
};

/** Predicate for `runner.resume.failed` when racing with `runner.resume.started`. */
export const resolveResumeFailedPredicate = (
	payload: unknown,
): WaitPredicate | undefined => {
	const pointId = readStringField(payload, 'pointId');
	return pointId !== undefined ? matchResumeFailed(pointId) : undefined;
};

/** Predicate for `workflow.load.failed` when racing with current snapshot. */
export const resolveLoadFailedPredicate = (
	payload: unknown,
): WaitPredicate | undefined => {
	const workflowId = readStringField(payload, 'workflowId');
	return workflowId !== undefined ? matchLoadFailed(workflowId) : undefined;
};
