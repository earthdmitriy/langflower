/**
 * Wait / request helpers over {@link langflowerWsConfig} client subjects.
 * Shared by integration tests and `@langflower/mcp` (no filesystem I/O).
 */

import type {
	NodeId,
	PortTelemetry,
	RunId,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import { isPortTelemetry, isRuntimeDone } from '@langflower/runtime';
import type { WsBridgeClientApi } from '@langflower/websocket-bridge';
import { filter, firstValueFrom, take, timeout, type Observable } from 'rxjs';
import { langflowerWsConfig } from './langflower-bus-config.js';
import type {
	ExecutionFeedSnapshotPayload,
	SessionStateSnapshotPayload,
} from './types/langflower-bootstrap.js';
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

const createClientRunId = (): RunId =>
	`run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` as RunId;

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

/**
 * Subscribe → send intent → wait until `predicate` (no bus `requestId`).
 * Always subscribe before `next` so a same-turn snapshot is not missed.
 */
const requestThenWait = <T>(
	source$: Observable<T>,
	send: () => void,
	predicate: (value: T) => boolean,
): Promise<T> => {
	const ready = firstValueFrom(source$.pipe(filter(predicate), take(1)));
	send();
	return ready;
};

const listOmitsWorkflowId =
	(workflowId: string) =>
	(list: WorkflowListSnapshotPayload): boolean =>
		!list.workflows.some((entry) => entry.workflowId === workflowId);

const currentIsActiveWorkflow =
	(workflowId: string) =>
	(snapshot: WorkflowCurrentSnapshotPayload): boolean =>
		snapshot.activeWorkflow?.workflowId === workflowId;

const currentIsSavedActive = (
	snapshot: WorkflowCurrentSnapshotPayload,
): boolean =>
	snapshot.activeWorkflow !== null &&
	snapshot.currentStatus.status === 'pristine';

export const requestWorkflowList = async (
	client: LangflowerWsClient,
	predicate: (payload: WorkflowListSnapshotPayload) => boolean,
): Promise<WorkflowListSnapshotPayload> =>
	requestThenWait(
		client['workflow.list.snapshot'],
		() => {
			client['workflow.list.requested'].next({});
		},
		predicate,
	);

export const requestWorkflowLoad = async (
	client: LangflowerWsClient,
	payload: WorkflowLoadPayload,
): Promise<WorkflowLoadedPayload> => {
	const snapshot = await requestThenWait(
		client['workflow.current.snapshot'],
		() => {
			client['workflow.load.requested'].next(payload);
		},
		currentIsActiveWorkflow(payload.workflowId),
	);

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
 * workflow. Pass `predicate` when the caller can name evidence; default is
 * the next emission (documented exception — no activation id to correlate).
 */
export const requestWorkflowLoadSnapshot = async (
	client: LangflowerWsClient,
	payload: WorkflowLoadPayload,
	predicate: (payload: WorkflowCurrentSnapshotPayload) => boolean = () =>
		true,
): Promise<WorkflowCurrentSnapshotPayload> =>
	requestThenWait(
		client['workflow.current.snapshot'],
		() => {
			client['workflow.load.requested'].next(payload);
		},
		predicate,
	);

export const requestWorkflowSaveCurrent = async (
	client: LangflowerWsClient,
): Promise<WorkflowCurrentSnapshotPayload> =>
	requestThenWait(
		client['workflow.current.snapshot'],
		() => {
			client['workflow.saveCurrent.requested'].next({});
		},
		currentIsSavedActive,
	);

export const requestWorkflowDelete = async (
	client: LangflowerWsClient,
	payload: WorkflowDeletePayload,
): Promise<WorkflowListSnapshotPayload> =>
	requestThenWait(
		client['workflow.list.snapshot'],
		() => {
			client['workflow.delete.requested'].next(payload);
		},
		listOmitsWorkflowId(payload.workflowId),
	);

export const startRunner = async (
	client: LangflowerWsClient,
): Promise<RunId> => {
	const runId = createClientRunId();
	const runIdPromise = firstValueFrom(
		client['runner.started'].pipe(
			filter((id) => id === runId),
			take(1),
		),
	);
	client['runner.start.requested'].next([undefined, runId]);
	return asRunId(await runIdPromise);
};

export const startRunnerFromNode = async (
	client: LangflowerWsClient,
	nodeId: NodeId,
): Promise<RunId> => {
	const runId = createClientRunId();
	const runIdPromise = firstValueFrom(
		client['runner.startNode.started'].pipe(
			filter((id) => id === runId),
			take(1),
		),
	);
	client['runner.startNode.requested'].next([nodeId, undefined, runId]);
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

export const sendHitlInput = async (
	client: LangflowerWsClient,
	payload: Parameters<LangflowerWsClient['runner.hitl.event']['next']>[0],
): Promise<PortTelemetry> => {
	const received$ = firstValueFrom(
		client['runner.port'].pipe(
			filter(
				(event): event is PortTelemetry =>
					isPortTelemetry(event) &&
					event[0] === 'in' &&
					event[1] === payload.nodeId &&
					event[2] === payload.portId,
			),
			take(1),
		),
	);

	client['runner.hitl.event'].next(payload);

	return received$;
};

type OutputPortTelemetry = PortTelemetry & {
	readonly 3: { readonly value: unknown };
};

export const waitForRunnerOutput = async (
	client: LangflowerWsClient,
	match: {
		readonly nodeId: string;
		readonly portId: string;
		readonly predicate?: (value: unknown) => boolean;
	},
): Promise<OutputPortTelemetry> =>
	firstValueFrom(
		client['runner.port'].pipe(
			filter(
				(event): event is OutputPortTelemetry =>
					isPortTelemetry(event) &&
					event[0] === 'out' &&
					'value' in event[3] &&
					event[1] === match.nodeId &&
					event[2] === match.portId &&
					(match.predicate === undefined ||
						match.predicate(event[3].value)),
			),
			take(1),
		),
	);

export const waitForRunnerDone = async (
	client: LangflowerWsClient,
	runId?: string,
): Promise<
	Extract<RuntimeRunnerEvent, readonly ['done'] | readonly ['done', RunId]>
> =>
	firstValueFrom(
		client['runner.done'].pipe(
			filter(
				(
					event,
				): event is Extract<
					RuntimeRunnerEvent,
					readonly ['done'] | readonly ['done', RunId]
				> =>
					isRuntimeDone(event) &&
					(runId === undefined || event[1] === runId),
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
