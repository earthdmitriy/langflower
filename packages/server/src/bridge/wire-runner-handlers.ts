import {
	isPortTelemetry,
	isRuntimeDone,
	type RunId,
	type RuntimeRunnerApi,
	type RuntimeRunnerEvent,
	type RuntimeSeedPortValue,
} from '@langflower/runtime';
import { buildWorkflowFingerprint } from '@langflower/shared/checkpoint/workflow-fingerprint.js';
import type {
	RunnerAskUserAskPayload,
	RunnerAskUserReplyPayload,
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
} from '@langflower/shared/types/langflower-config.js';
import type {
	RunnerCheckpointDiscardRequestedPayload,
	RunnerResumeRequestedPayload,
} from '@langflower/shared/types/workflow-checkpoint.js';
import { Subscription } from 'rxjs';
import { listResumableCheckpoints } from '../checkpoint/list-resumable-checkpoints.js';
import { resolveCheckpointBoundary } from '../checkpoint/resolve-checkpoint-boundary.js';
import { RunCheckpointSession } from '../checkpoint/run-checkpoint-session.js';
import type { ServerContext } from '../server-context.js';
import type { ResolveNodeDefinition } from '../workflow/workflow-document.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { resetSessionExecutionFeed } from '../session/reset-session-execution-feed.js';
import { buildContextSeeds } from './build-execution-context.js';
import { getLiveWiredTools } from './get-live-wired-tools.js';
import { createLangflowerToolsRpc } from './langflower-tools-rpc.js';
import { bridgeEmit, clientEmit } from './bridge-outbound.js';
import { findClientById } from './client-index.js';
import { isInboundEvent } from './inbound-guards.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

const logCheckpointStoreFailure = (
	operation: 'persist' | 'complete' | 'stop',
	error: unknown,
): void => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(
		`Langflower checkpoint ${operation} failed: ${message}\n`,
	);
};

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
 * Checkpoint observe / persist / terminal broadcast for one runner event.
 * Called from the always-on `events$` composer in attach (forward first).
 */
export const persistCheckpointFromRunnerEvent = (
	bridge: LangflowerBridge,
	session: LangflowerSession,
	checkpoints: RunCheckpointSession,
	event: RuntimeRunnerEvent,
	resolveDefinition: ResolveNodeDefinition,
): void => {
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
					resolveDefinition,
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
			.catch((error: unknown) => {
				logCheckpointStoreFailure('persist', error);
			});
	}

	if (isRuntimeDone(event)) {
		void checkpoints
			.markCompleted()
			.then(async (summary) => {
				if (summary !== undefined) {
					bridgeEmit(bridge, 'runner.checkpointed', summary);
				}

				await broadcastCheckpoints(bridge, session, checkpoints);
			})
			.catch((error: unknown) => {
				logCheckpointStoreFailure('complete', error);
			});
	}
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

	const emitPermissionAccepted = (
		payload: RunnerPermissionReplyPayload,
	): void => {
		bridgeEmit(bridge, 'runner.permission.accepted', payload);
	};

	const emitAskUserAsk = (payload: RunnerAskUserAskPayload): void => {
		bridgeEmit(bridge, 'runner.askUser.ask', payload);
	};

	const requestLangflowerBus = createLangflowerToolsRpc(bridge);
	const liveWiredTools = (agentNodeId: string) =>
		getLiveWiredTools(session, agentNodeId);

	const seedLiveContext = async (resolvedRunId: RunId) =>
		buildContextSeeds(
			session,
			context,
			resolvedRunId,
			emitPermissionAsk,
			emitAskUserAsk,
			emitPermissionAccepted,
			requestLangflowerBus,
			liveWiredTools,
		);

	// Exclusive start token: held across `await seedLiveContext` so a second
	// idle start cannot dispose the winner's MCP or roll back its checkpoint.
	let startHeld = false;

	const isStartBusy = (): boolean =>
		startHeld || session.runnerStatus === 'running';

	const beginSeededRun = async (args: {
		readonly resolvedRunId: RunId;
		readonly clientSeeds?:
			| Readonly<Record<string, ReadonlyArray<RuntimeSeedPortValue>>>
			| undefined;
		readonly start: (
			seeds: Record<string, ReadonlyArray<RuntimeSeedPortValue>>,
			runId: RunId,
		) => RunId | false;
		readonly announce: (runId: RunId) => void;
	}): Promise<RunId | false> => {
		if (isStartBusy()) {
			return false;
		}

		startHeld = true;
		session.runnerStatus = 'running';
		let started = false;

		try {
			const contextSeeds = await seedLiveContext(args.resolvedRunId);
			const initialPayload = mergeSeeds(contextSeeds, args.clientSeeds);
			if (session.activeWorkflow !== null) {
				checkpoints.beginRun(
					args.resolvedRunId,
					session.activeWorkflow,
				);
			}

			const runId = args.start(initialPayload, args.resolvedRunId);
			if (runId === false) {
				return false;
			}

			started = true;
			session.runId = runId;
			// Same turn as `start()` so `runner.started` precedes port telemetry
			// (wiring flushes on a later microtask). Do not announce after `await`.
			args.announce(runId);
			return runId;
		} finally {
			startHeld = false;
			if (!started) {
				session.runnerStatus = 'idle';
				checkpoints.clearActive();
			}
		}
	};

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

				await beginSeededRun({
					resolvedRunId,
					clientSeeds: clientInitialPayload,
					start: (seeds, id) =>
						session.runtime.runner.start(seeds, id),
					announce: (id) => bridgeEmit(bridge, 'runner.started', id),
				});
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

				await beginSeededRun({
					resolvedRunId,
					clientSeeds: clientInitialPayload,
					start: (seeds, id) =>
						session.runtime.runner.startNode(nodeId, seeds, id),
					announce: (id) =>
						bridgeEmit(bridge, 'runner.startNode.started', id),
				});
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
				.catch((error: unknown) => {
					logCheckpointStoreFailure('stop', error);
				});
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

				if (isStartBusy()) {
					fail('BUSY', 'A run is already active');
					return;
				}

				startHeld = true;
				let started = false;

				try {
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

					const unsupported =
						checkpoints.getUnsupportedValueMessage();
					if (unsupported !== undefined) {
						fail('UNSUPPORTED_VALUE', unsupported, runId);
						return;
					}

					session.runnerStatus = 'running';

					const contextSeeds = await seedLiveContext(
						checkpoint.runId as RunId,
					);

					checkpoints.hydrateFromCheckpoint(checkpoint, workflow);
					const resumeOptions =
						checkpoints.resumeOptionsFromCheckpoint(checkpoint);

					const resumed = session.runtime.runner.resume({
						...resumeOptions,
						initialPayload: contextSeeds,
					});

					if (resumed === false) {
						fail('BUSY', 'Runner rejected resume', runId);
						return;
					}

					started = true;
					session.runId = resumed;
					bridgeEmit(bridge, 'runner.resume.started', resumed);
				} finally {
					startHeld = false;
					if (!started) {
						session.runnerStatus = 'idle';
						checkpoints.clearActive();
					}
				}
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
					const runId = await beginSeededRun({
						resolvedRunId,
						start: (seeds, id) =>
							session.runtime.runner.startNode(
								pushPayload.nodeId,
								seeds,
								id,
							),
						announce: (id) =>
							bridgeEmit(bridge, 'runner.started', id),
					});
					if (runId === false) {
						return;
					}
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
		bridge['runner.askUser.reply'].subscribe((raw) => {
			if (!isInboundEvent<RunnerAskUserReplyPayload>(raw)) {
				return;
			}

			const connected = findClientById(bridge, raw.clientId);

			if (connected === undefined) {
				return;
			}

			if (session.askUserAsks.reply(raw.payload)) {
				bridgeEmit(bridge, 'runner.askUser.accepted', raw.payload);
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
