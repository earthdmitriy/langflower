import { isRuntimeDone } from '@langflower/runtime';
import {
	deriveExecutionProgressStatus,
	terminalExecutionProgressStatus,
	type TerminalExecutionProgressStatus,
} from '@langflower/shared/langflower.js';
import { Subscription } from 'rxjs';
import { RunCheckpointSession } from '../checkpoint/run-checkpoint-session.js';
import type { ServerContext } from '../server-context.js';
import { LangflowerSession } from '../session/langflower-session.js';
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
import { wireRunnerHandlers } from './wire-runner-handlers.js';
import { wireWorkflowHandlers } from './wire-workflow-handlers.js';
import { createSettingsDraftController } from './settings-draft-controller.js';

export type { LangflowerBridge } from './langflower-bridge.types.js';

export type AttachLangflowerBridgeOptions = {
	readonly onRunSettled?: (status: TerminalExecutionProgressStatus) => void;
	/** Initial effective `serverLogs` gate (defaults to enabled). */
	readonly serverLogsEnabled?: boolean;
};

/**
 * Wire `langflowerWsConfig` handlers onto the WS bridge.
 *
 * Call order (see also `BRIDGE.md`):
 * 0. Diagnostic bridge JSONL log (gated by effective `serverLogs`)
 * 1. Always-on runner telemetry fan-out
 * 2. Connect / disconnect → index + bootstrap snapshots
 * 3. Intent handlers by bus namespace (workflow → palette → editor → runner)
 */
export const attachLangflowerBridge = (
	bridge: LangflowerBridge,
	context: ServerContext,
	options: AttachLangflowerBridgeOptions = {},
): (() => Promise<void>) => {
	const session = new LangflowerSession();
	const checkpoints = new RunCheckpointSession(context.projectDir);
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

	// 1. Always-on telemetry: subscribe once for the whole bridge lifetime,
	// independent of clients/runs. Guarantees initial `pending` events from
	// `runner.start()` are captured — a later per-client subscription would
	// miss them (`events$` is a non-replaying Subject). Late clients get the
	// backlog via `executionFeed.snapshot`. See FOUND_BUGS pending race.
	rootSubscription.add(
		session.runtime.runner.events$.subscribe((event) => {
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

			forwardRunnerEvent(bridge, event);
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
				checkpoints,
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
	rootSubscription.add(wireWorkflowHandlers(bridge, context, session));
	rootSubscription.add(wirePaletteHandlers(bridge, context));
	rootSubscription.add(wireCustomPaletteHandlers(bridge, context));
	rootSubscription.add(
		wireConfigHandlers(bridge, context, session, draftController, {
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
		wireRunnerHandlers(bridge, context, session, checkpoints),
	);

	return async () => {
		diagnosticLog.writeServerClosing();
		rootSubscription.unsubscribe();
		clearClientIndex(bridge);
		session.dispose();
		await diagnosticLog.flush();
	};
};
