import type {
	WorkflowSessionCreateRequestedPayload,
	WorkflowSessionDiscardPointRequestedPayload,
	WorkflowSessionScopedRequestedPayload,
	WorkflowSessionSelectRequestedPayload,
} from '@langflower/shared/types/workflow-session.js';
import { Subscription } from 'rxjs';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import {
	createWorkflowSession,
	deleteWorkflowSession,
	discardWorkflowSessionPoint,
	resetWorkflowSessionConversation,
	replaceSnapshotFromWorkflow,
	selectWorkflowSession,
	writeSnapshotToWorkflow,
	type WorkflowSessionActionDeps,
	type WorkflowSessionActionResult,
} from '../workflow-sessions/workflow-session-actions.js';
import type { WorkflowSessionAutosave } from '../workflow-sessions/workflow-session-autosave.js';
import { readWorkflowSessionSnapshots } from '../workflow-sessions/workflow-session-snapshots.js';
import type { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';
import { bridgeEmit } from './bridge-outbound.js';
import { findClientById } from './client-index.js';
import { isInboundEvent } from './inbound-guards.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const publishWorkflowSession = async (
	bridge: LangflowerBridge,
	session: LangflowerSession,
	store: WorkflowSessionStore,
	result: WorkflowSessionActionResult,
): Promise<void> => {
	if (!result.ok) {
		bridgeEmit(bridge, 'workflowSession.action.failed', {
			code: result.code,
			message: result.message,
		});
	}

	if (result.ok && result.canvasChanged) {
		bridgeEmit(bridge, 'workflow.current.snapshot', {
			activeWorkflow: session.activeWorkflow,
			currentStatus: { status: session.currentStatus },
		});
	}

	if (result.ok && result.feedChanged) {
		bridgeEmit(
			bridge,
			'executionFeed.snapshot',
			session.buildExecutionFeed(),
		);
	}

	const snapshots = await readWorkflowSessionSnapshots(session, store);
	bridgeEmit(bridge, 'workflowSession.list.snapshot', snapshots.list);
	bridgeEmit(bridge, 'workflowSession.current.snapshot', snapshots.current);
};

export const wireWorkflowSessionHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
	store: WorkflowSessionStore,
	autosave: WorkflowSessionAutosave,
): Subscription => {
	const subscription = new Subscription();
	const deps: WorkflowSessionActionDeps = {
		session,
		store,
		workflowService: context.workflowService,
		resolveDefinition: context.resolveDefinition,
		autosave,
	};

	subscription.add(
		bridge['workflowSession.create.requested'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<WorkflowSessionCreateRequestedPayload>(raw)
				) {
					return;
				}

				if (!isRecord(raw.payload)) {
					return;
				}

				if (findClientById(bridge, raw.clientId) === undefined) {
					return;
				}

				const result = await createWorkflowSession(deps);
				await publishWorkflowSession(bridge, session, store, result);
			})();
		}),
	);

	subscription.add(
		bridge['workflowSession.select.requested'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<WorkflowSessionSelectRequestedPayload>(raw)
				) {
					return;
				}

				const sessionId = raw.payload.sessionId;

				if (sessionId !== null && typeof sessionId !== 'string') {
					return;
				}

				if (findClientById(bridge, raw.clientId) === undefined) {
					return;
				}

				const result = await selectWorkflowSession(deps, sessionId);
				await publishWorkflowSession(bridge, session, store, result);
			})();
		}),
	);

	subscription.add(
		bridge['workflowSession.delete.requested'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<WorkflowSessionScopedRequestedPayload>(raw)
				) {
					return;
				}

				if (typeof raw.payload.sessionId !== 'string') {
					return;
				}

				if (findClientById(bridge, raw.clientId) === undefined) {
					return;
				}

				const result = await deleteWorkflowSession(
					deps,
					raw.payload.sessionId,
				);
				await publishWorkflowSession(bridge, session, store, result);
			})();
		}),
	);

	subscription.add(
		bridge[
			'workflowSession.replaceSnapshotFromWorkflow.requested'
		].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<WorkflowSessionScopedRequestedPayload>(raw)
				) {
					return;
				}

				if (typeof raw.payload.sessionId !== 'string') {
					return;
				}

				if (findClientById(bridge, raw.clientId) === undefined) {
					return;
				}

				const result = await replaceSnapshotFromWorkflow(
					deps,
					raw.payload.sessionId,
				);
				await publishWorkflowSession(bridge, session, store, result);
			})();
		}),
	);

	subscription.add(
		bridge['workflowSession.writeSnapshotToWorkflow.requested'].subscribe(
			(raw) => {
				void (async () => {
					if (
						!isInboundEvent<WorkflowSessionScopedRequestedPayload>(
							raw,
						)
					) {
						return;
					}

					if (typeof raw.payload.sessionId !== 'string') {
						return;
					}

					if (findClientById(bridge, raw.clientId) === undefined) {
						return;
					}

					const result = await writeSnapshotToWorkflow(
						deps,
						raw.payload.sessionId,
					);
					await publishWorkflowSession(
						bridge,
						session,
						store,
						result,
					);
				})();
			},
		),
	);

	subscription.add(
		bridge['workflowSession.resetConversation.requested'].subscribe(
			(raw) => {
				void (async () => {
					if (
						!isInboundEvent<WorkflowSessionScopedRequestedPayload>(
							raw,
						)
					) {
						return;
					}

					if (typeof raw.payload.sessionId !== 'string') {
						return;
					}

					if (findClientById(bridge, raw.clientId) === undefined) {
						return;
					}

					const result = await resetWorkflowSessionConversation(
						deps,
						raw.payload.sessionId,
					);
					await publishWorkflowSession(
						bridge,
						session,
						store,
						result,
					);
				})();
			},
		),
	);

	subscription.add(
		bridge['workflowSession.discardPoint.requested'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<WorkflowSessionDiscardPointRequestedPayload>(
						raw,
					)
				) {
					return;
				}

				if (
					typeof raw.payload.sessionId !== 'string' ||
					typeof raw.payload.pointId !== 'string'
				) {
					return;
				}

				if (findClientById(bridge, raw.clientId) === undefined) {
					return;
				}

				const result = await discardWorkflowSessionPoint(
					deps,
					raw.payload.sessionId,
					raw.payload.pointId,
				);
				await publishWorkflowSession(bridge, session, store, result);
			})();
		}),
	);

	return subscription;
};
