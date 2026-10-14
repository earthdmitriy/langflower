import { hasCustomNodePacks } from '@langflower/compiler/discover-packs';
import { DEFAULT_CONFIG } from '@langflower/shared/constants/defaults.js';
import type { ServerContext } from '../server-context.js';
import { buildSessionBootstrap } from '../session/build-session-bootstrap.js';
import { LangflowerSession } from '../session/langflower-session.js';
import { loadWorkflowIntoSession } from '../workflow/load-workflow-into-session.js';
import { bindLatestWorkflowSession } from '../workflow-sessions/workflow-session-actions.js';
import type { WorkflowSessionAutosave } from '../workflow-sessions/workflow-session-autosave.js';
import { readWorkflowSessionSnapshots } from '../workflow-sessions/workflow-session-snapshots.js';
import type { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';
import { buildLangflowerConfigSnapshot } from './build-langflower-config-snapshot.js';
import { clientEmit } from './bridge-outbound.js';
import type { LangflowerClient } from './langflower-bridge.types.js';
import { pushModelsCatalogToClient } from './push-models-catalog.js';
import type { SettingsDraftController } from './settings-draft-controller.js';

/**
 * After the workflow file loads, the newest non-corrupt session is bound
 * before these snapshots. Connect / reconnect bootstrap emit order:
 * session.state.snapshot → runner.snapshot → executionFeed.snapshot →
 * toolConfig.snapshot → workflow.list/current.snapshot →
 * workflowSession.list/current.snapshot → session.ready →
 * langflower.config.snapshot → langflower.config.draft.snapshot →
 * (async) langflower.models.catalog.snapshot →
 * permission.ask / askUser.ask replay → palette.snapshot → customPalette.snapshot
 * (custom snapshot is warm from createServer — emit only, no compile).
 */
export const emitBootstrap = async (
	client: LangflowerClient,
	context: ServerContext,
	session: LangflowerSession,
	workflowSessions: WorkflowSessionStore,
	autosave: WorkflowSessionAutosave,
	draftController?: SettingsDraftController,
): Promise<void> => {
	const langflowerConfig = await context.langflowerConfigService.read();

	if (
		langflowerConfig.currentWorkflowId !== undefined &&
		session.activeWorkflow === null
	) {
		await loadWorkflowIntoSession(
			session,
			context.workflowService,
			langflowerConfig.currentWorkflowId,
			context.resolveDefinition,
		);
		if (session.activeWorkflow !== null) {
			session.savedWorkflowDocument = session.activeWorkflow;
			await bindLatestWorkflowSession({
				session,
				store: workflowSessions,
				workflowService: context.workflowService,
				resolveDefinition: context.resolveDefinition,
				autosave,
			});
		}
	}

	// Apply persisted divider positions from config
	if (langflowerConfig.dividerPositions !== undefined) {
		session.dividerPositions = langflowerConfig.dividerPositions;
	}

	if (langflowerConfig.paletteVisible !== undefined) {
		session.paletteVisible = langflowerConfig.paletteVisible;
	}

	// Thin bootstrap — version + config + dividers + palette chrome + selected node only
	const bootstrap = await buildSessionBootstrap(
		session,
		context.langflowerConfigService,
		context.resolveDefinition,
		context.projectDir,
		context.customNodeRegistry,
	);
	clientEmit(client, 'session.state.snapshot', bootstrap);

	// Domain snapshots
	clientEmit(client, 'runner.snapshot', {
		status: session.runnerStatus,
		...(session.runId !== undefined ? { runId: session.runId } : {}),
		...(session.activeWorkflowId !== undefined
			? { activeWorkflowId: session.activeWorkflowId }
			: {}),
	});
	clientEmit(client, 'executionFeed.snapshot', session.buildExecutionFeed());

	const toolConfigRead = await context.configService.read();
	const toolConfig = toolConfigRead.ok
		? toolConfigRead.config
		: { ...DEFAULT_CONFIG, projectDir: context.projectDir };
	clientEmit(client, 'toolConfig.snapshot', { config: toolConfig });

	// Workflow slices
	const workflows = await context.workflowService.list();
	clientEmit(client, 'workflow.list.snapshot', { workflows });
	clientEmit(client, 'workflow.current.snapshot', {
		activeWorkflow: session.activeWorkflow,
		currentStatus: { status: session.currentStatus },
	});

	const sessionSnapshots = await readWorkflowSessionSnapshots(
		session,
		workflowSessions,
	);
	clientEmit(client, 'workflowSession.list.snapshot', sessionSnapshots.list);
	clientEmit(
		client,
		'workflowSession.current.snapshot',
		sessionSnapshots.current,
	);

	clientEmit(client, 'session.ready', {
		version: LangflowerSession.sessionReadyVersion,
	});
	clientEmit(
		client,
		'langflower.config.snapshot',
		await buildLangflowerConfigSnapshot(context),
	);

	if (draftController !== undefined) {
		await draftController.pushToClient(client, session.settings.scope);
	}

	// Live model catalogs — do not block palette / connect on models.list().
	void pushModelsCatalogToClient(client, context);

	// Re-surface in-flight permission asks after reconnect (tool loop still waiting).
	for (const ask of session.permissionAsks.list()) {
		clientEmit(client, 'runner.permission.ask', ask);
	}

	for (const ask of session.askUserAsks.list()) {
		clientEmit(client, 'runner.askUser.ask', ask);
	}

	const paletteResult = await context.paletteService.reload();
	clientEmit(client, 'palette.snapshot', paletteResult.payload);

	const customSnapshot = context.customPaletteService.getSnapshot();
	if (
		customSnapshot.status === 'not_compiled' &&
		!(await hasCustomNodePacks(context.projectDir))
	) {
		clientEmit(
			client,
			'customPalette.snapshot',
			context.customPaletteService.applyEmptyOk(),
		);
	} else {
		clientEmit(client, 'customPalette.snapshot', customSnapshot);
	}
};
