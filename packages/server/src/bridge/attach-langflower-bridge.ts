import { isRuntimeDone } from '@langflower/runtime';
import {
	deriveExecutionProgressStatus,
	terminalExecutionProgressStatus,
	type TerminalExecutionProgressStatus,
} from '@langflower/shared/execution/derive-run-settle-outcome.js';
import { Subscription } from 'rxjs';
import { RunProgressAccumulator } from '../checkpoint/run-progress-accumulator.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import {
	createWorkflowSessionHeadFlush,
	isNonStreamingPortEvent,
} from '../workflow-sessions/workflow-session-run.js';
import { WorkflowSessionAutosave } from '../workflow-sessions/workflow-session-autosave.js';
import type { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';
import {
	clearClientIndex,
	indexClient,
	unindexClient,
} from './client-index.js';
import { attachBridgeEventLog } from './bridge-event-log.js';
import { emitBootstrap } from './emit-bootstrap.js';
import { forwardRunnerEvent } from './forward-runner-event.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';
import {
	applyServerLogsGate,
	wireConfigHandlers,
} from './wire-config-handlers.js';
import { wireEditorHandlers } from './wire-editor-handlers.js';
import { wireCustomPaletteHandlers } from './wire-custom-palette-handlers.js';
import { wirePaletteHandlers } from './wire-palette-handlers.js';
import { wireProjectBootstrapHandlers } from './wire-project-bootstrap-handlers.js';
import {
	appendSessionPointFromRunnerEvent,
	wireRunnerHandlers,
} from './wire-runner-handlers.js';
import { wireWorkflowHandlers } from './wire-workflow-handlers.js';
import { wireWorkflowSessionHandlers } from './wire-workflow-session-handlers.js';
import { createSettingsDraftController } from './settings-draft-controller.js';

export type { LangflowerBridge } from './langflower-bridge.types.js';

export type AttachLangflowerBridgeOptions = {
	readonly onRunSettled?: (status: TerminalExecutionProgressStatus) => void;
	/** Initial effective `serverLogs` gate (defaults to enabled). */
	readonly serverLogsEnabled?: boolean;
	readonly session: LangflowerSession;
	readonly workflowSessions: WorkflowSessionStore;
};

/**
 * Wire `langflowerWsConfig` handlers onto the WS bridge.
 *
 * Call order (see also `BRIDGE.md`):
 * 0. Diagnostic bridge JSONL log (gated by effective `serverLogs`)
 * 1. Always-on runner event composer (forward → session point → settle)
 * 2. Connect / disconnect → index + bootstrap snapshots
 * 3. Intent handlers by bus namespace (workflow → palette → customPalette
 *    → config → project bootstrap → editor → runner).
 * `bridgeEmit` broadcasts; `clientEmit` unicasts via `client-index`.
 */
export const attachLangflowerBridge = (
	bridge: LangflowerBridge,
	context: ServerContext,
	options: AttachLangflowerBridgeOptions,
): (() => Promise<void>) => {
	const { session, workflowSessions } = options;
	const progress = new RunProgressAccumulator();
	const autosave = new WorkflowSessionAutosave(session, workflowSessions);
	session.attachWorkflowSessionAutosave(autosave);
	const headFlush = createWorkflowSessionHeadFlush(
		session,
		workflowSessions,
		autosave,
	);
	const pendingPointWrites = new Set<Promise<void>>();
	const rootSubscription = new Subscription();
	const onRunSettled = options.onRunSettled;
	const diagnosticLog = attachBridgeEventLog(
		bridge,
		context.projectDir,
		rootSubscription,
		{ enabled: options.serverLogsEnabled !== false },
	);
	const draftController = createSettingsDraftController(
		bridge,
		context,
		session,
	);

	// 1. Always-on runner composer: one subscribe for the bridge lifetime.
	// Sibling steps: forward → session point → onRunSettled.
	// Independent of clients/runs so initial `pending` from `runner.start()`
	// is not dropped (`events$` is a non-replaying Subject). Late clients
	// get the backlog via `executionFeed.snapshot`. See FOUND_BUGS pending race.
	rootSubscription.add(
		session.runtime.runner.events$.subscribe((event) => {
			forwardRunnerEvent(bridge, event);
			const pointWrite = appendSessionPointFromRunnerEvent(
				bridge,
				session,
				progress,
				event,
				context.resolveDefinition,
				workflowSessions,
			);

			if (pointWrite !== undefined) {
				pendingPointWrites.add(pointWrite);
				void pointWrite.finally(() => {
					pendingPointWrites.delete(pointWrite);
				});
			}

			if (isNonStreamingPortEvent(event)) {
				headFlush.schedule();
			}

			if (isRuntimeDone(event) && onRunSettled !== undefined) {
				const progress = deriveExecutionProgressStatus(
					'idle',
					session.runtime.runner.eventLog,
				);
				const status = terminalExecutionProgressStatus(progress);
				if (status !== null) {
					onRunSettled(status);
				}
			}
		}),
	);

	// 2. Connect / disconnect → single client index + domain bootstrap
	rootSubscription.add(
		bridge.connections$.subscribe((client) => {
			indexClient(bridge, client);

			const subscriptions = new Subscription();
			rootSubscription.add(subscriptions);

			void emitBootstrap(
				client,
				context,
				session,
				workflowSessions,
				autosave,
				draftController,
			);

			subscriptions.add(
				client.disconnected$.subscribe(() => {
					subscriptions.unsubscribe();
					unindexClient(bridge, client.id);
				}),
			);
		}),
	);

	// 3. Intent handlers (bus namespaces)
	rootSubscription.add(
		wireWorkflowHandlers(
			bridge,
			context,
			session,
			workflowSessions,
			autosave,
		),
	);
	rootSubscription.add(wirePaletteHandlers(bridge, context));
	rootSubscription.add(wireCustomPaletteHandlers(bridge, context, session));
	rootSubscription.add(
		wireConfigHandlers(bridge, context, draftController, {
			onEffectiveConfig: (config) => {
				applyServerLogsGate(diagnosticLog.setEnabled, config);
			},
		}),
	);
	rootSubscription.add(
		wireProjectBootstrapHandlers(bridge, context, session),
	);
	rootSubscription.add(
		wireEditorHandlers(bridge, context, session, draftController),
	);
	rootSubscription.add(
		wireWorkflowSessionHandlers(
			bridge,
			context,
			session,
			workflowSessions,
			autosave,
		),
	);
	rootSubscription.add(
		wireRunnerHandlers(
			bridge,
			context,
			session,
			progress,
			workflowSessions,
			autosave,
			headFlush.flushNow,
		),
	);

	return async () => {
		diagnosticLog.writeServerClosing();
		rootSubscription.unsubscribe();
		await headFlush.flushNow();
		await Promise.all(pendingPointWrites);
		await autosave.flush();
		clearClientIndex(bridge);
		session.dispose();
		await diagnosticLog.flush();
	};
};
