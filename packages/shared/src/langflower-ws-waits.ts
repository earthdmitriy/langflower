/**
 * Wait / request helpers over {@link langflowerWsConfig} client subjects.
 * Shared by integration tests and `@langflower/mcp` (no filesystem I/O).
 */

import type { NodeId, RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type { WsBridgeClientApi } from '@langflower/websocket-bridge';
import { filter, firstValueFrom, take, timeout, type Observable } from 'rxjs';
import { langflowerWsConfig } from './langflower-bus-config.js';
import type {
	ExecutionFeedSnapshotPayload,
	SessionStateSnapshotPayload,
} from './types/langflower-bootstrap.js';
import type { LangflowerConfigSnapshotPayload } from './types/langflower-config.js';
import type {
	WorkflowCurrentSnapshotPayload,
	WorkflowDeletePayload,
	WorkflowListSnapshotPayload,
	WorkflowLoadPayload,
	WorkflowLoadedPayload,
} from './types/langflower-workflow.js';

const asRunId = (value: RunId | false): RunId => {
	if (value === false) {
		throw new Error(
			'runner start returned false (empty graph or rejected)',
		);
	}
	return value;
};

export type LangflowerWsClient = WsBridgeClientApi<typeof langflowerWsConfig>;

/**
 * Wait until connected and `session.ready` has been seen.
 * Subscribe to `session.ready` **before** awaiting `connected` so bootstrap
 * frames that arrive in the same turn are not missed (hot inbound subjects).
 */
export const waitSessionReady = async (
	client: LangflowerWsClient,
): Promise<void> => {
	const readyPromise = firstValueFrom(client['session.ready'].pipe(take(1)));
	await firstValueFrom(
		client.status$.pipe(
			filter((status) => status === 'connected'),
			take(1),
		),
	);
	await readyPromise;
};

export const waitSessionSnapshot = async (
	client: LangflowerWsClient,
): Promise<SessionStateSnapshotPayload> => {
	const snapshotPromise = firstValueFrom(
		client['session.state.snapshot'].pipe(take(1)),
	);
	const readyPromise = firstValueFrom(client['session.ready'].pipe(take(1)));

	await firstValueFrom(
		client.status$.pipe(
			filter((status) => status === 'connected'),
			take(1),
		),
	);

	const [snapshot] = await Promise.all([snapshotPromise, readyPromise]);
	return snapshot;
};

export const waitLangflowerConfigSnapshot = async (
	client: LangflowerWsClient,
): Promise<LangflowerConfigSnapshotPayload> =>
	firstValueFrom(client['langflower.config.snapshot'].pipe(take(1)));

export const waitWorkflowListSnapshot = async (
	client: LangflowerWsClient,
	predicate: (payload: WorkflowListSnapshotPayload) => boolean,
): Promise<WorkflowListSnapshotPayload> =>
	firstValueFrom(
		client['workflow.list.snapshot'].pipe(filter(predicate), take(1)),
	);

export const waitWorkflowCurrentSnapshot = async (
	client: LangflowerWsClient,
	predicate: (payload: WorkflowCurrentSnapshotPayload) => boolean,
): Promise<WorkflowCurrentSnapshotPayload> =>
	firstValueFrom(
		client['workflow.current.snapshot'].pipe(filter(predicate), take(1)),
	);

export const requestWorkflowList = async (
	client: LangflowerWsClient,
): Promise<WorkflowListSnapshotPayload> => {
	const snapshot$ = firstValueFrom(
		client['workflow.list.snapshot'].pipe(take(1)),
	);
	client['workflow.list.requested'].next({});
	return snapshot$;
};

export const requestWorkflowLoad = async (
	client: LangflowerWsClient,
	payload: WorkflowLoadPayload,
): Promise<WorkflowLoadedPayload> => {
	const snapshot$ = firstValueFrom(
		client['workflow.current.snapshot'].pipe(
			filter(
				(snapshot) =>
					snapshot.activeWorkflow?.workflowId === payload.workflowId,
			),
			take(1),
		),
	);

	client['workflow.load.requested'].next(payload);

	const snapshot = await snapshot$;
	const active = snapshot.activeWorkflow;

	if (active === null || active.workflowId !== payload.workflowId) {
		throw new Error(`load did not activate workflow ${payload.workflowId}`);
	}

	return active;
};

/**
 * Load then await the post-mutation current snapshot (success or keep-active).
 * Unlike {@link requestWorkflowLoad}, does **not** require `workflowId` to
 * become active — failed/unknown loads still sync a snapshot with the prior
 * workflow. Subscribe before `next` so the reply is not missed.
 */
export const requestWorkflowLoadSnapshot = async (
	client: LangflowerWsClient,
	payload: WorkflowLoadPayload,
): Promise<WorkflowCurrentSnapshotPayload> => {
	const snapshot$ = firstValueFrom(
		client['workflow.current.snapshot'].pipe(take(1)),
	);

	client['workflow.load.requested'].next(payload);

	return snapshot$;
};

export const requestWorkflowSaveCurrent = async (
	client: LangflowerWsClient,
): Promise<WorkflowCurrentSnapshotPayload> => {
	const snapshot$ = firstValueFrom(
		client['workflow.current.snapshot'].pipe(take(1)),
	);

	client['workflow.saveCurrent.requested'].next({});

	return snapshot$;
};

export const requestWorkflowDelete = async (
	client: LangflowerWsClient,
	payload: WorkflowDeletePayload,
): Promise<WorkflowListSnapshotPayload> => {
	const list$ = firstValueFrom(
		client['workflow.list.snapshot'].pipe(
			filter(
				(list) =>
					!list.workflows.some(
						(entry) => entry.workflowId === payload.workflowId,
					),
			),
			take(1),
		),
	);

	client['workflow.delete.requested'].next(payload);

	return list$;
};

export const requestWorkflowDeleteSnapshot = async (
	client: LangflowerWsClient,
	payload: WorkflowDeletePayload,
): Promise<WorkflowListSnapshotPayload> => {
	const list$ = firstValueFrom(
		client['workflow.list.snapshot'].pipe(
			filter(
				(list) =>
					!list.workflows.some(
						(entry) => entry.workflowId === payload.workflowId,
					),
			),
			take(1),
		),
	);

	client['workflow.delete.requested'].next(payload);

	return list$;
};

export const startRunner = async (
	client: LangflowerWsClient,
): Promise<RunId> => {
	const runIdPromise = firstValueFrom(client['runner.started'].pipe(take(1)));
	client['runner.start.requested'].next([]);
	return asRunId(await runIdPromise);
};

export const startRunnerFromNode = async (
	client: LangflowerWsClient,
	nodeId: NodeId,
): Promise<RunId> => {
	const runIdPromise = firstValueFrom(
		client['runner.startNode.started'].pipe(take(1)),
	);
	client['runner.startNode.requested'].next([nodeId]);
	return asRunId(await runIdPromise);
};

export const interruptRunner = async (
	client: LangflowerWsClient,
): Promise<void> => {
	const interrupted$ = firstValueFrom(
		client['runner.interrupted'].pipe(take(1)),
	);
	client['runner.interrupt.requested'].next('cancel');
	await interrupted$;
};

type InputReceivedEvent = Extract<
	RuntimeRunnerEvent,
	{ kind: 'input-received' }
>;

export const sendHitlInput = async (
	client: LangflowerWsClient,
	payload: Parameters<LangflowerWsClient['runner.hitl.event']['next']>[0],
	runId?: string,
): Promise<InputReceivedEvent> => {
	const received$ = firstValueFrom(
		client['runner.input-received'].pipe(
			filter(
				(event): event is InputReceivedEvent =>
					event.kind === 'input-received' &&
					event.nodeId === payload.nodeId &&
					event.portId === payload.portId &&
					(runId === undefined || event.runId === runId),
			),
			take(1),
		),
	);

	client['runner.hitl.event'].next(payload);

	return received$;
};

type OutputEmittedEvent = Extract<
	RuntimeRunnerEvent,
	{ kind: 'output-emitted'; state: 'value' }
>;

export const waitForRunnerOutput = async (
	client: LangflowerWsClient,
	match: {
		readonly nodeId: string;
		readonly portId: string;
		readonly runId?: string;
		readonly predicate?: (value: unknown) => boolean;
	},
): Promise<OutputEmittedEvent> =>
	firstValueFrom(
		client['runner.output-emitted'].pipe(
			filter(
				(event): event is OutputEmittedEvent =>
					event.kind === 'output-emitted' &&
					event.state === 'value' &&
					event.nodeId === match.nodeId &&
					event.portId === match.portId &&
					(match.runId === undefined ||
						event.runId === match.runId) &&
					(match.predicate === undefined ||
						match.predicate(event.value)),
			),
			take(1),
		),
	);

export const waitForRunnerDone = async (
	client: LangflowerWsClient,
	runId?: string,
): Promise<Extract<RuntimeRunnerEvent, { kind: 'done' }>> =>
	firstValueFrom(
		client['runner.done'].pipe(
			filter(
				(
					event,
				): event is Extract<RuntimeRunnerEvent, { kind: 'done' }> =>
					event.kind === 'done' &&
					(runId === undefined || event.runId === runId),
			),
			take(1),
		),
	);

export const waitExecutionFeedSnapshot = async (
	client: LangflowerWsClient,
	predicate: (snap: ExecutionFeedSnapshotPayload | null) => boolean = () =>
		true,
): Promise<ExecutionFeedSnapshotPayload | null> =>
	firstValueFrom(
		client['executionFeed.snapshot'].pipe(filter(predicate), take(1)),
	);

/**
 * Await the next value on a typed inbound bus stream (with optional timeout).
 */
export const waitBusEvent = async <T>(
	source$: Observable<T>,
	options?: {
		readonly timeoutMs?: number;
		readonly predicate?: (value: T) => boolean;
	},
): Promise<T> => {
	const timeoutMs = options?.timeoutMs ?? 30_000;
	const predicate = options?.predicate ?? (() => true);

	try {
		return await firstValueFrom(
			source$.pipe(
				filter(predicate),
				take(1),
				timeout({ first: timeoutMs }),
			),
		);
	} catch (error) {
		throw new Error(`waitBusEvent timed out after ${String(timeoutMs)}ms`, {
			cause: error,
		});
	}
};
