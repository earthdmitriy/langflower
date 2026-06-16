import type {
	WorkflowCopyPayload,
	WorkflowCreatePayload,
	WorkflowDeletePayload,
	WorkflowLoadPayload,
	WorkflowRenameCurrentPayload,
} from '@langflower/shared/langflower.js';
import { Subscription } from 'rxjs';
import { listResumableCheckpoints } from '../checkpoint/list-resumable-checkpoints.js';
import { WorkflowCheckpointStore } from '../checkpoint/workflow-checkpoint-store.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { buildSaveCurrentPayload } from '../workflow/build-save-current-payload.js';
import { copyWorkflowToSession } from '../workflow/copy-workflow-to-session.js';
import { createEmptyWorkflowInSession } from '../workflow/create-empty-workflow-in-session.js';
import { loadWorkflowIntoSession } from '../workflow/load-workflow-into-session.js';
import { renameActiveWorkflow } from '../workflow/rename-active-workflow.js';
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
};

/**
 * Composer: clear selection → current snapshot → optional catalog sync.
 * Sibling steps — handlers do not call these in nested order themselves.
 */
const syncAfterWorkflowMutation = async (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
	client: LangflowerClient,
	options: SyncAfterWorkflowMutationOptions,
): Promise<void> => {
	// 1. Clear selection (and notify tabs if it was set)
	if (options.clearSelection) {
		const hadSelection = session.selectedNodeId !== null;
		session.selectedNodeId = null;
		if (hadSelection) {
			bridgeEmit(bridge, 'editor.nodeSelected', { node: null });
		}
	}

	// 2. Authoritative current-workflow slice (session-shared — fan out)
	bridgeEmit(bridge, 'workflow.current.snapshot', {
		activeWorkflow: session.activeWorkflow,
		currentStatus: { status: session.currentStatus },
	});

	// 3. Resumable checkpoints for the active workflow (explicit boundaries)
	const workflowId = session.activeWorkflowId ?? null;
	const checkpoints = await listResumableCheckpoints(
		new WorkflowCheckpointStore(context.projectDir),
		workflowId,
		session.activeWorkflow,
	);
	bridgeEmit(bridge, 'runner.checkpoints.snapshot', {
		workflowId,
		checkpoints,
	});

	// 4. Catalog sync
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
): Subscription => {
	const subscription = new Subscription();

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

			if (!session.isGraphLocked()) {
				// 1. Load document into session
				const loaded = await loadWorkflowIntoSession(
					session,
					context.workflowService,
					context.projectDir,
					raw.payload.workflowId,
					context.resolveDefinition,
				);

				// 2. Persist current-workflow id when load succeeded
				if (loaded.ok) {
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
			} else {
				clientEmit(connected, 'workflow.load.failed', {
					workflowId: raw.payload.workflowId,
					code: 'GRAPH_LOCKED',
					message: 'Cannot load workflow while the graph is locked',
				});
			}

			// 3. Sync outbound
			await syncAfterWorkflowMutation(
				bridge,
				context,
				session,
				connected,
				{ clearSelection, catalog: { kind: 'none' } },
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

			let catalogChanged = false;

			if (!session.isGraphLocked()) {
				const payload = buildSaveCurrentPayload(session);

				if (payload !== null) {
					const result = await context.workflowService.save(payload);

					if (result.ok) {
						session.activeWorkflow = result.document;
						session.activeWorkflowId = result.document.workflowId;
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

			let catalogChanged = false;

			if (!session.isGraphLocked()) {
				const renamed = await renameActiveWorkflow(
					session,
					context.workflowService,
					raw.payload.name,
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

			if (!session.isGraphLocked()) {
				await createEmptyWorkflowInSession(
					session,
					context.workflowService,
					context.projectDir,
					context.resolveDefinition,
				);
				clearSelection = true;
			}

			await syncAfterWorkflowMutation(
				bridge,
				context,
				session,
				connected,
				{ clearSelection, catalog: { kind: 'none' } },
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

			if (!session.isGraphLocked()) {
				const copied = await copyWorkflowToSession(
					session,
					context.workflowService,
					context.projectDir,
					raw.payload.workflowId,
					context.resolveDefinition,
				);

				if (copied && session.activeWorkflowId !== undefined) {
					catalogChanged = true;
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
					catalog: catalogChanged
						? { kind: 'broadcast' }
						: { kind: 'none' },
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

			let catalogChanged = false;
			let clearSelection = false;

			if (!session.isGraphLocked()) {
				// 1. Delete persisted workflow
				const result = await context.workflowService.delete(
					raw.payload.workflowId,
				);

				if (result.ok) {
					catalogChanged = true;

					// 2. If it was active — deactivate session + clear config
					if (session.activeWorkflowId === raw.payload.workflowId) {
						session.activeWorkflow = null;
						session.activeWorkflowId = undefined;
						session.markPristine();
						await context.langflowerConfigService.setCurrentWorkflowId(
							undefined,
						);
						clearSelection = true;
					}
				}
			}

			// 3. Sync outbound (broadcast catalog on success; else refresh list for requester)
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
				},
			);
		}),
	);

	return subscription;
};
