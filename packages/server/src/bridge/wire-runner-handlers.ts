import {
	isPortTelemetry,
	isRuntimeDone,
	type RunId,
	type RuntimeRunnerApi,
	type RuntimeSeedPortValue,
} from '@langflower/runtime';
import {
	buildWorkflowFingerprint,
	type RunnerCheckpointDiscardRequestedPayload,
	type RunnerPermissionAskPayload,
	type RunnerPermissionReplyPayload,
	type RunnerResumeRequestedPayload,
} from '@langflower/shared/langflower.js';
import { Subscription } from 'rxjs';
import { listResumableCheckpoints } from '../checkpoint/list-resumable-checkpoints.js';
import { resolveCheckpointBoundary } from '../checkpoint/resolve-checkpoint-boundary.js';
import { RunCheckpointSession } from '../checkpoint/run-checkpoint-session.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { resetSessionExecutionFeed } from '../session/reset-session-execution-feed.js';
import {
	buildContextSeeds,
	applyObservableContextSeeds,
} from './build-execution-context.js';
import { getLiveWiredTools } from './get-live-wired-tools.js';
import { createLangflowerToolsRpc } from './langflower-tools-rpc.js';
import { bridgeEmit, clientEmit } from './bridge-outbound.js';
import { findClientById } from './client-index.js';
import { isInboundEvent } from './inbound-guards.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

const mergeSeeds = (
	...parts: ReadonlyArray<
		Record<string, ReadonlyArray<RuntimeSeedPortValue>> | undefined
	>
): Record<string, ReadonlyArray<RuntimeSeedPortValue>> => {
	const result: Record<string, ReadonlyArray<RuntimeSeedPortValue>> = {};

	for (const part of parts) {
		if (!part) {
			continue;
		}

		for (const [nodeId, seeds] of Object.entries(part)) {
			result[nodeId] = [...(result[nodeId] ?? []), ...seeds];
		}
	}

	return result;
};

const broadcastCheckpoints = async (
	bridge: LangflowerBridge,
	session: LangflowerSession,
	checkpoints: RunCheckpointSession,
): Promise<void> => {
	const workflowId = session.activeWorkflowId ?? null;
	const list = await listResumableCheckpoints(
		checkpoints.getStore(),
		workflowId,
		session.activeWorkflow,
	);

	bridgeEmit(bridge, 'runner.checkpoints.snapshot', {
		workflowId,
		checkpoints: list,
	});
};

/**
 * When a run has no `stopsRun` node in scope, the appended finish sink (one per
 * terminal node) ends the run; no `output-emitted` "complete" signal is needed.
 */
export const wireRunnerHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
	checkpoints: RunCheckpointSession,
): Subscription => {
	const subscription = new Subscription();

	const emitPermissionAsk = (payload: RunnerPermissionAskPayload): void => {
		bridgeEmit(bridge, 'runner.permission.ask', payload);
	};

	const requestLangflowerBus = createLangflowerToolsRpc(bridge);
	const liveWiredTools = (agentNodeId: string) =>
		getLiveWiredTools(session, agentNodeId);

	subscription.add(
		session.runtime.runner.events$.subscribe((event) => {
			const [, nodeId, portId] = isPortTelemetry(event) ? event : [];
			const boundary =
				isPortTelemetry(event) &&
				event[0] === 'out' &&
				typeof portId === 'string' &&
				session.activeWorkflow !== null
					? resolveCheckpointBoundary(
							session.activeWorkflow,
							String(nodeId),
							portId,
						)
					: undefined;

			const shouldPersist = checkpoints.observe(
				event,
				boundary === undefined
					? undefined
					: boundary.label !== undefined
						? { label: boundary.label }
						: {},
			);

			if (shouldPersist) {
				void checkpoints
					.persist('running')
					.then((summary) => {
						if (summary === undefined) {
							return;
						}

						bridgeEmit(bridge, 'runner.checkpointed', summary);
					})
					.catch(() => undefined);
			}

			if (isRuntimeDone(event)) {
				void checkpoints
					.markCompleted()
					.then(async (summary) => {
						if (summary !== undefined) {
							bridgeEmit(bridge, 'runner.checkpointed', summary);
						}

						await broadcastCheckpoints(
							bridge,
							session,
							checkpoints,
						);
					})
					.catch(() => undefined);
			}
		}),
	);

	subscription.add(
		bridge['runner.start.requested'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<Parameters<RuntimeRunnerApi['start']>>(raw)
				) {
					return;
				}

				const connected = findClientById(bridge, raw.clientId);

				if (connected === undefined) {
					return;
				}

				const [clientInitialPayload, clientRunId] = raw.payload;
				const resolvedRunId = (clientRunId ??
					crypto.randomUUID()) as RunId;

				// Lock before async seed build so workflow load cannot race in.
				session.runnerStatus = 'running';

				const contextSeeds = applyObservableContextSeeds(
					session,
					await buildContextSeeds(
						session,
						context,
						resolvedRunId,
						emitPermissionAsk,
						requestLangflowerBus,
						liveWiredTools,
					),
				);

				const initialPayload = mergeSeeds(
					contextSeeds,
					clientInitialPayload,
				);

				if (session.activeWorkflow !== null) {
					checkpoints.beginRun(resolvedRunId, session.activeWorkflow);
				}

				const runId = session.runtime.runner.start(
					initialPayload,
					resolvedRunId,
				);
				if (runId === false) {
					session.runnerStatus = 'idle';
					checkpoints.clearActive();
					return;
				}

				session.runId = runId;
				bridgeEmit(bridge, 'runner.started', runId);
			})();
		}),
	);

	subscription.add(
		bridge['runner.startNode.requested'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<Parameters<RuntimeRunnerApi['startNode']>>(
						raw,
					)
				) {
					return;
				}

				const connected = findClientById(bridge, raw.clientId);

				if (connected === undefined) {
					return;
				}

				const [nodeId, clientInitialPayload, clientRunId] = raw.payload;
				const resolvedRunId = (clientRunId ??
					crypto.randomUUID()) as RunId;

				session.runnerStatus = 'running';

				const contextSeeds = applyObservableContextSeeds(
					session,
					await buildContextSeeds(
						session,
						context,
						resolvedRunId,
						emitPermissionAsk,
						requestLangflowerBus,
						liveWiredTools,
					),
				);

				const initialPayload = mergeSeeds(
					contextSeeds,
					clientInitialPayload,
				);

				if (session.activeWorkflow !== null) {
					checkpoints.beginRun(resolvedRunId, session.activeWorkflow);
				}

				const runId = session.runtime.runner.startNode(
					nodeId,
					initialPayload,
					resolvedRunId,
				);

				if (runId === false) {
					session.runnerStatus = 'idle';
					checkpoints.clearActive();
					return;
				}

				session.runId = runId;
				bridgeEmit(bridge, 'runner.startNode.started', runId);
			})();
		}),
	);

	subscription.add(
		bridge['runner.interrupt.requested'].subscribe((raw) => {
			if (
				!isInboundEvent<Parameters<RuntimeRunnerApi['interrupt']>[0]>(
					raw,
				)
			) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			session.runtime.runner.interrupt(raw.payload);
			bridgeEmit(bridge, 'runner.interrupted', raw.payload);

			void checkpoints
				.markStopped()
				.then(async (summary) => {
					if (summary !== undefined) {
						bridgeEmit(bridge, 'runner.checkpointed', summary);
					}

					await broadcastCheckpoints(bridge, session, checkpoints);
				})
				.catch(() => undefined);
		}),
	);

	subscription.add(
		bridge['runner.resume.requested'].subscribe((raw) => {
			void (async () => {
				if (!isInboundEvent<RunnerResumeRequestedPayload>(raw)) {
					return;
				}

				const connected = findClientById(bridge, raw.clientId);

				if (connected === undefined) {
					return;
				}

				const fail = (
					code:
						| 'CORRUPT'
						| 'STALE_WORKFLOW'
						| 'UNSUPPORTED_VALUE'
						| 'NOT_FOUND'
						| 'BUSY'
						| 'NO_WORKFLOW',
					message: string,
					runId?: string,
				): void => {
					clientEmit(connected, 'runner.resume.failed', {
						code,
						message,
						...(runId !== undefined ? { runId } : {}),
					});
				};

				if (session.runnerStatus === 'running') {
					fail('BUSY', 'A run is already active');
					return;
				}

				const workflow = session.activeWorkflow;
				if (
					workflow === null ||
					session.activeWorkflowId === undefined
				) {
					fail('NO_WORKFLOW', 'No active workflow to resume');
					return;
				}

				const runId = raw.payload.runId;

				const loaded = await checkpoints
					.getStore()
					.load(session.activeWorkflowId, runId);

				if (!loaded.ok) {
					fail(loaded.code, loaded.message, runId);
					return;
				}

				const checkpoint = loaded.checkpoint;

				const fingerprint = buildWorkflowFingerprint(
					workflow.graph.nodes,
					workflow.graph.edges,
				);

				if (fingerprint !== checkpoint.workflowFingerprint) {
					fail(
						'STALE_WORKFLOW',
						'Workflow topology changed since the checkpoint was written',
						runId,
					);
					return;
				}

				if (checkpoint.completedNodeIds.length === 0) {
					fail(
						'NOT_FOUND',
						'Checkpoint has no completed stages to resume from',
						runId,
					);
					return;
				}

				const unsupported = checkpoints.getUnsupportedValueMessage();
				if (unsupported !== undefined) {
					fail('UNSUPPORTED_VALUE', unsupported, runId);
					return;
				}

				session.runnerStatus = 'running';

				const contextSeeds = applyObservableContextSeeds(
					session,
					await buildContextSeeds(
						session,
						context,
						checkpoint.runId as RunId,
						emitPermissionAsk,
						requestLangflowerBus,
						liveWiredTools,
					),
				);

				checkpoints.hydrateFromCheckpoint(checkpoint, workflow);
				const resumeOptions =
					checkpoints.resumeOptionsFromCheckpoint(checkpoint);

				const resumed = session.runtime.runner.resume({
					...resumeOptions,
					initialPayload: contextSeeds,
				});

				if (resumed === false) {
					session.runnerStatus = 'idle';
					checkpoints.clearActive();
					fail('BUSY', 'Runner rejected resume', runId);
					return;
				}

				session.runId = resumed;
				bridgeEmit(bridge, 'runner.resume.started', resumed);
			})();
		}),
	);

	subscription.add(
		bridge['runner.checkpoint.discard.requested'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<RunnerCheckpointDiscardRequestedPayload>(
						raw,
					)
				) {
					return;
				}

				const connected = findClientById(bridge, raw.clientId);

				if (connected === undefined) {
					return;
				}

				const workflowId = session.activeWorkflowId;
				if (workflowId === undefined) {
					return;
				}

				await checkpoints
					.getStore()
					.discard(workflowId, raw.payload.runId);
				checkpoints.clearActive();
				await broadcastCheckpoints(bridge, session, checkpoints);
			})();
		}),
	);

	subscription.add(
		bridge['runner.hitl.event'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<
						Parameters<RuntimeRunnerApi['pushIntoInput']>[0]
					>(raw)
				) {
					return;
				}

				const connected = findClientById(bridge, raw.clientId);

				if (connected === undefined) {
					return;
				}

				const pushPayload = raw.payload;
				const wasIdle = session.runnerStatus !== 'running';

				// Cold-start (chat entry): seed context, start cluster, announce
				// `runner.started`, then deliver the composer message.
				if (wasIdle) {
					const resolvedRunId = crypto.randomUUID() as RunId;
					session.runnerStatus = 'running';

					const contextSeeds = applyObservableContextSeeds(
						session,
						await buildContextSeeds(
							session,
							context,
							resolvedRunId,
							emitPermissionAsk,
							requestLangflowerBus,
							liveWiredTools,
						),
					);

					if (session.activeWorkflow !== null) {
						checkpoints.beginRun(
							resolvedRunId,
							session.activeWorkflow,
						);
					}

					const runId = session.runtime.runner.startNode(
						pushPayload.nodeId,
						contextSeeds,
						resolvedRunId,
					);

					if (runId === false) {
						session.runnerStatus = 'idle';
						checkpoints.clearActive();
						return;
					}

					session.runId = runId;
					bridgeEmit(bridge, 'runner.started', runId);
				}

				session.runtime.runner.pushIntoInput(pushPayload);
			})();
		}),
	);

	subscription.add(
		bridge['runner.permission.reply'].subscribe((raw) => {
			if (!isInboundEvent<RunnerPermissionReplyPayload>(raw)) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			if (session.permissionAsks.reply(raw.payload)) {
				bridgeEmit(bridge, 'runner.permission.accepted', raw.payload);
			}
		}),
	);

	subscription.add(
		bridge['runner.executionFeed.clear.requested'].subscribe((raw) => {
			if (!isInboundEvent<{}>(raw)) {
				return;
			}

			// Clear is only allowed after a run settles — wiping the log mid-run
			// also wiped canvas chrome (shared executionFeed.snapshot).
			if (session.runnerStatus === 'running') {
				return;
			}

			resetSessionExecutionFeed(session);

			// Re-broadcast the (now empty) feed to every tab.
			bridgeEmit(
				bridge,
				'executionFeed.snapshot',
				session.buildExecutionFeed(),
			);
		}),
	);

	return subscription;
};
