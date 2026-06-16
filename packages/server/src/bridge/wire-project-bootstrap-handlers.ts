import type { ProjectBootstrapResultPayload } from '@langflower/shared/langflower.js';
import { Subscription } from 'rxjs';
import { bootstrapProject } from '../bootstrap/project-bootstrap.service.js';
import { listResumableCheckpoints } from '../checkpoint/list-resumable-checkpoints.js';
import { WorkflowCheckpointStore } from '../checkpoint/workflow-checkpoint-store.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { loadWorkflowIntoSession } from '../workflow/load-workflow-into-session.js';
import { bridgeEmit, clientEmit } from './bridge-outbound.js';
import { findClientById } from './client-index.js';
import { isInboundEvent } from './inbound-guards.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

const failResult = (message: string): ProjectBootstrapResultPayload => ({
	ok: false,
	message,
});

/**
 * Settings → Bootstrap: force-reseed skeleton templates, refresh snapshots.
 * Rejects while a run is active. Never rewrites `langflower.jsonc`.
 */
export const wireProjectBootstrapHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
): Subscription =>
	bridge['project.bootstrap.requested'].subscribe(async (raw) => {
		if (!isInboundEvent<Record<string, never>>(raw)) {
			return;
		}

		const connected = findClientById(bridge, raw.clientId);

		if (connected === undefined) {
			return;
		}

		const emitResult = (result: ProjectBootstrapResultPayload): void => {
			clientEmit(connected, 'project.bootstrap.result', result);
		};

		if (session.runnerStatus !== 'idle') {
			emitResult(
				failResult(
					'Cannot bootstrap while a run is active. Stop the run first.',
				),
			);
			return;
		}

		try {
			const { workflowIds } = await bootstrapProject(context.projectDir, {
				mode: 'force',
			});

			const workflows = await context.workflowService.list();
			bridgeEmit(bridge, 'workflow.list.snapshot', { workflows });

			const activeId = session.activeWorkflowId;
			if (
				activeId !== undefined &&
				workflowIds.includes(activeId) &&
				!session.isGraphLocked()
			) {
				await loadWorkflowIntoSession(
					session,
					context.workflowService,
					context.projectDir,
					activeId,
					context.resolveDefinition,
				);

				bridgeEmit(bridge, 'workflow.current.snapshot', {
					activeWorkflow: session.activeWorkflow,
					currentStatus: { status: session.currentStatus },
				});

				const checkpoints = await listResumableCheckpoints(
					new WorkflowCheckpointStore(context.projectDir),
					activeId,
					session.activeWorkflow,
				);
				bridgeEmit(bridge, 'runner.checkpoints.snapshot', {
					workflowId: activeId,
					checkpoints,
				});
			}

			bridgeEmit(
				bridge,
				'customPalette.snapshot',
				context.customPaletteService.compilingSnapshot(),
			);
			const customPalette = await context.customPaletteService.update(
				context.projectDir,
			);
			bridgeEmit(bridge, 'customPalette.snapshot', customPalette);

			emitResult({ ok: true });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Failed to bootstrap project from skeleton';
			emitResult(failResult(message));
		}
	});
