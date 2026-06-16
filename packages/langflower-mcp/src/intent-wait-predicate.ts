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
	(event) => {
		if (!isRecord(event) || event['kind'] !== 'input-received') {
			return false;
		}
		return event['nodeId'] === nodeId && event['portId'] === portId;
	};

const matchExecutionFeedCleared = (): WaitPredicate => (event) => {
	if (event === null) {
		return true;
	}
	if (!isRecord(event) || !Array.isArray(event['events'])) {
		return false;
	}
	return event['events'].length === 0;
};

const matchCheckpointDiscarded =
	(runId: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event) || !Array.isArray(event['checkpoints'])) {
			return false;
		}
		return !event['checkpoints'].some(
			(entry) =>
				isRecord(entry) &&
				typeof entry['runId'] === 'string' &&
				entry['runId'] === runId,
		);
	};

const matchResumeFailed =
	(runId: string): WaitPredicate =>
	(event) => {
		if (!isRecord(event)) {
			return false;
		}
		const failedRunId = event['runId'];
		return failedRunId === undefined || failedRunId === runId;
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
		case 'runner.executionFeed.clear.requested':
			return matchExecutionFeedCleared();
		case 'runner.resume.requested': {
			const runId = readStringField(payload, 'runId');
			return runId !== undefined ? matchRunId(runId) : undefined;
		}
		case 'runner.checkpoint.discard.requested': {
			const runId = readStringField(payload, 'runId');
			return runId !== undefined
				? matchCheckpointDiscarded(runId)
				: undefined;
		}
		default:
			return undefined;
	}
};

/** Predicate for `runner.resume.failed` when racing with `runner.resume.started`. */
export const resolveResumeFailedPredicate = (
	payload: unknown,
): WaitPredicate | undefined => {
	const runId = readStringField(payload, 'runId');
	return runId !== undefined ? matchResumeFailed(runId) : undefined;
};
