import type {
	WorkflowCopyPayload,
	WorkflowCreatePayload,
	WorkflowDeletePayload,
	WorkflowLoadPayload,
	WorkflowRenameCurrentPayload,
} from '@langflower/shared/types/langflower-workflow.js';
import type { WorkflowSessionActionFailedPayload } from '@langflower/shared/types/workflow-session.js';
import { Subscription } from 'rxjs';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { resetSessionExecutionFeed } from '../session/reset-session-execution-feed.js';
import { buildSaveCurrentPayload } from '../workflow/build-save-current-payload.js';
import { copyWorkflowToSession } from '../workflow/copy-workflow-to-session.js';
import { createEmptyWorkflowInSession } from '../workflow/create-empty-workflow-in-session.js';
import { loadWorkflowIntoSession } from '../workflow/load-workflow-into-session.js';
import { renameActiveWorkflow } from '../workflow/rename-active-workflow.js';
import {
	bindLatestWorkflowSession,
	leaveWorkflowSession,
} from '../workflow-sessions/workflow-session-actions.js';
import type { WorkflowSessionAutosave } from '../workflow-sessions/workflow-session-autosave.js';
import { readWorkflowSessionSnapshots } from '../workflow-sessions/workflow-session-snapshots.js';
import type { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';
import { bridgeEmit, clientEmit } from './bridge-outbound.js';
import { findClientById } from './client-index.js';
import { isInboundEvent } from './inbound-guards.js';
import type {
	LangflowerBridge,
	LangflowerClient,
} from './langflower-bridge.types.js';

type SyncAfterWorkflowMutationOptions = {
	readonly clearSelection: boolean;
	readonly catalog:
		| { readonly kind: 'none' }
		| { readonly kind: 'broadcast' }
		| { readonly kind: 'emitToClient' };
	readonly resetFeed?: boolean;
	readonly workflowSessions: WorkflowSessionStore;
};

/**
 * Composer: optional feed reset → clear selection → current snapshot →
 * workflow session snapshots → optional catalog sync. Sibling steps —
 * handlers do not nest these.
 */
const syncAfterWorkflowMutation = async (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
	client: LangflowerClient,
	options: SyncAfterWorkflowMutationOptions,
): Promise<void> => {
	// 1. Document switch: empty feed before the new catalog so the UI never
	// paints the previous run under the next workflow's nodes.
	if (options.resetFeed === true) {
		resetSessionExecutionFeed(session);
		bridgeEmit(
			bridge,
			'executionFeed.snapshot',
			session.buildExecutionFeed(),
		);
	}

	// 2. Clear selection (and notify tabs if it was set)
	if (options.clearSelection) {
		const hadSelection = session.selectedNodeId !== null;
		session.selectedNodeId = null;
		if (hadSelection) {
			bridgeEmit(bridge, 'editor.nodeSelected', { node: null });
		}
	}

	// 3. Authoritative current-workflow slice (session-shared — fan out)
	bridgeEmit(bridge, 'workflow.current.snapshot', {
		activeWorkflow: session.activeWorkflow,
		currentStatus: { status: session.currentStatus },
	});

	// 4. Workflow session list + current (after the workflow id is known)
	const sessionSnapshots = await readWorkflowSessionSnapshots(
		session,
		options.workflowSessions,
	);
	bridgeEmit(bridge, 'workflowSession.list.snapshot', sessionSnapshots.list);
	bridgeEmit(
		bridge,
		'workflowSession.current.snapshot',
		sessionSnapshots.current,
	);

	// 5. Catalog sync
	if (options.catalog.kind === 'broadcast') {
		const workflows = await context.workflowService.list();
		bridgeEmit(bridge, 'workflow.list.snapshot', { workflows });
		return;
	}

	if (options.catalog.kind === 'emitToClient') {
		const workflows = await context.workflowService.list();
		clientEmit(client, 'workflow.list.snapshot', { workflows });
	}
};

export const wireWorkflowHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
	workflowSessions: WorkflowSessionStore,
	autosave: WorkflowSessionAutosave,
): Subscription => {
	const subscription = new Subscription();
	const sessionDeps = {
		session,
		store: workflowSessions,
		workflowService: context.workflowService,
		resolveDefinition: context.resolveDefinition,
		autosave,
	};

	const sessionBoundRefusal = (): WorkflowSessionActionFailedPayload => ({
		code: 'SESSION_BOUND',
		message:
			'A workflow session is bound; the workflow file was not changed',
	});

	const leaveBoundSession = async (): Promise<boolean> => {
		if (session.binding.kind !== 'workflowSession') {
			return true;
		}

		const left = await leaveWorkflowSession(sessionDeps);

		if (!left.ok) {
			bridgeEmit(bridge, 'workflowSession.action.failed', {
				code: left.code,
				message: left.message,
			});
			return false;
		}

		return true;
	};

	subscription.add(
		bridge['workflow.list.requested'].subscribe(async (raw) => {
			if (!isInboundEvent<Record<string, never>>(raw)) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			const workflows = await context.workflowService.list();
			clientEmit(connected, 'workflow.list.snapshot', { workflows });
		}),
	);

	subscription.add(
		bridge['workflow.load.requested'].subscribe(async (raw) => {
			if (!isInboundEvent<WorkflowLoadPayload>(raw)) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			let clearSelection = false;
			let resetFeed = false;

			if (!session.isGraphLocked()) {
				// Leave a bound session before opening another workflow.
				if (await leaveBoundSession()) {
					const loaded = await loadWorkflowIntoSession(
						session,
						context.workflowService,
						raw.payload.workflowId,
						context.resolveDefinition,
					);

					if (loaded.ok) {
						resetFeed = true;
						session.savedWorkflowDocument = session.activeWorkflow;
						await bindLatestWorkflowSession(sessionDeps);
						await context.langflowerConfigService.setCurrentWorkflowId(
							raw.payload.workflowId,
						);

						if (loaded.repaired) {
							const nodeCount = loaded.droppedNodeIds.length;
							const edgeCount = loaded.droppedEdgeIds.length;
							clientEmit(connected, 'workflow.load.repaired', {
								workflowId: raw.payload.workflowId,
								droppedNodeIds: loaded.droppedNodeIds,
								droppedEdgeIds: loaded.droppedEdgeIds,
								message: `Loaded with ${nodeCount} node(s) / ${edgeCount} edge(s) removed (invalid). Save to keep.`,
							});
						}
					} else {
						clientEmit(connected, 'workflow.load.failed', {
							workflowId: raw.payload.workflowId,
							code: loaded.code,
							message: loaded.message,
						});
					}

					clearSelection = true;
				}
			} else {
				clientEmit(connected, 'workflow.load.failed', {
					workflowId: raw.payload.workflowId,
					code: 'GRAPH_LOCKED',
					message: 'Cannot load workflow while the graph is locked',
				});
			}

			await syncAfterWorkflowMutation(
				bridge,
				context,
				session,
				connected,
				{
					clearSelection,
					catalog: { kind: 'none' },
					resetFeed,
					workflowSessions,
				},
			);
		}),
	);

	subscription.add(
		bridge['workflow.saveCurrent.requested'].subscribe(async (raw) => {
			if (!isInboundEvent<Record<string, never>>(raw)) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			if (session.binding.kind === 'workflowSession') {
				bridgeEmit(
					bridge,
					'workflowSession.action.failed',
					sessionBoundRefusal(),
				);
				return;
			}

			let catalogChanged = false;

			if (!session.isGraphLocked()) {
				const payload = buildSaveCurrentPayload(session);

				if (payload !== null) {
					const result = await context.workflowService.save(payload);

					if (result.ok) {
						session.activeWorkflow = result.document;
						session.activeWorkflowId = result.document.workflowId;
						session.savedWorkflowDocument = result.document;
						session.markPristine();
						catalogChanged = true;
					}
				}
			}

			await syncAfterWorkflowMutation(
				bridge,
				context,
				session,
				connected,
				{
					clearSelection: false,
					catalog: catalogChanged
						? { kind: 'broadcast' }
						: { kind: 'none' },
					workflowSessions,
				},
			);
		}),
	);

	subscription.add(
		bridge['workflow.renameCurrent.requested'].subscribe(async (raw) => {
			if (!isInboundEvent<WorkflowRenameCurrentPayload>(raw)) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			if (session.binding.kind === 'workflowSession') {
				bridgeEmit(
					bridge,
					'workflowSession.action.failed',
					sessionBoundRefusal(),
				);
				return;
			}

			let catalogChanged = false;

			if (!session.isGraphLocked()) {
				const renamed = await renameActiveWorkflow(
					session,
					context.workflowService,
					raw.payload.name,
					workflowSessions,
				);

				if (renamed !== null) {
					catalogChanged = renamed.catalogChanged;
					await context.langflowerConfigService.setCurrentWorkflowId(
						renamed.document.workflowId,
					);
				}
			}

			await syncAfterWorkflowMutation(
				bridge,
				context,
				session,
				connected,
				{
					clearSelection: false,
					catalog: catalogChanged
						? { kind: 'broadcast' }
						: { kind: 'none' },
					workflowSessions,
				},
			);
		}),
	);

	subscription.add(
		bridge['workflow.create.requested'].subscribe(async (raw) => {
			if (!isInboundEvent<WorkflowCreatePayload>(raw)) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			let clearSelection = false;
			let resetFeed = false;

			if (!session.isGraphLocked() && (await leaveBoundSession())) {
				const created = await createEmptyWorkflowInSession(
					session,
					context.workflowService,
					context.resolveDefinition,
				);
				clearSelection = true;
				resetFeed = created;
				if (created) {
					session.savedWorkflowDocument = null;
				}
			}

			await syncAfterWorkflowMutation(
				bridge,
				context,
				session,
				connected,
				{
					clearSelection,
					catalog: { kind: 'none' },
					resetFeed,
					workflowSessions,
				},
			);
		}),
	);

	subscription.add(
		bridge['workflow.copy.requested'].subscribe(async (raw) => {
			if (!isInboundEvent<WorkflowCopyPayload>(raw)) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			let catalogChanged = false;
			let clearSelection = false;
			let resetFeed = false;

			if (!session.isGraphLocked() && (await leaveBoundSession())) {
				const copied = await copyWorkflowToSession(
					session,
					context.workflowService,
					raw.payload.workflowId,
					context.resolveDefinition,
				);

				if (copied && session.activeWorkflowId !== undefined) {
					catalogChanged = true;
					resetFeed = true;
					session.savedWorkflowDocument = session.activeWorkflow;
					await context.langflowerConfigService.setCurrentWorkflowId(
						session.activeWorkflowId,
					);
				}

				clearSelection = true;
			}

			await syncAfterWorkflowMutation(
				bridge,
				context,
				session,
				connected,
				{
					clearSelection,
					resetFeed,
					catalog: catalogChanged
						? { kind: 'broadcast' }
						: { kind: 'none' },
					workflowSessions,
				},
			);
		}),
	);

	subscription.add(
		bridge['workflow.delete.requested'].subscribe(async (raw) => {
			if (!isInboundEvent<WorkflowDeletePayload>(raw)) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			if (session.binding.kind === 'workflowSession') {
				bridgeEmit(
					bridge,
					'workflowSession.action.failed',
					sessionBoundRefusal(),
				);
				return;
			}

			let catalogChanged = false;
			let clearSelection = false;

			if (!session.isGraphLocked()) {
				const result = await context.workflowService.delete(
					raw.payload.workflowId,
				);

				if (result.ok) {
					catalogChanged = true;
					await workflowSessions.deleteAll(raw.payload.workflowId);

					if (session.activeWorkflowId === raw.payload.workflowId) {
						session.activeWorkflow = null;
						session.activeWorkflowId = undefined;
						session.binding = { kind: 'workflow' };
						session.headNodeStates = {};
						session.boundFeedSnapshot = undefined;
						session.savedWorkflowDocument = null;
						session.markPristine();
						await context.langflowerConfigService.setCurrentWorkflowId(
							undefined,
						);
						clearSelection = true;
					}
				}
			}

			await syncAfterWorkflowMutation(
				bridge,
				context,
				session,
				connected,
				{
					clearSelection,
					catalog: catalogChanged
						? { kind: 'broadcast' }
						: { kind: 'emitToClient' },
					workflowSessions,
				},
			);
		}),
	);

	return subscription;
};
