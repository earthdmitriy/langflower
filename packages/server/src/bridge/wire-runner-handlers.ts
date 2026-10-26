import {
	isPortTelemetry,
	isRuntimeDone,
	type NodeId,
	type RunId,
	type RuntimeNodeStates,
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
	WorkflowSessionResumeFailedCode,
	WorkflowSessionResumeRequestedPayload,
} from '@langflower/shared/types/workflow-session.js';
import { Subscription } from 'rxjs';
import { resolveCheckpointBoundary } from '../checkpoint/resolve-checkpoint-boundary.js';
import { RunProgressAccumulator } from '../checkpoint/run-progress-accumulator.js';
import type { ServerContext } from '../server-context.js';
import type { ResolveNodeDefinition } from '../workflow/workflow-document.js';
import type { LangflowerSession } from '../session/langflower-session.js';
import { resetSessionExecutionFeed } from '../session/reset-session-execution-feed.js';
import type { WorkflowSessionAutosave } from '../workflow-sessions/workflow-session-autosave.js';
import { ensureSessionForRun } from '../workflow-sessions/workflow-session-actions.js';
import {
	appendWorkflowSessionPoint,
	applyPointToSessionHead,
	applyWorkflowSessionNodeState,
	beginSessionFeedRun,
	decidePointResume,
	logWorkflowSessionRestoreFailures,
} from '../workflow-sessions/workflow-session-run.js';
import { readWorkflowSessionSnapshots } from '../workflow-sessions/workflow-session-snapshots.js';
import type { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';
import {
	readBoundSessionUpload,
	stageBoundSessionUpload,
} from './bind-llm-context.js';
import { buildContextSeeds } from './build-execution-context.js';
import { getLiveWiredTools } from './get-live-wired-tools.js';
import { createLangflowerToolsRpc } from './langflower-tools-rpc.js';
import { bridgeEmit, clientEmit } from './bridge-outbound.js';
import { findClientById } from './client-index.js';
import { isInboundEvent } from './inbound-guards.js';
import { planParkedRecovery } from '../workflow-sessions/parked-recovery.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';

const publishWorkflowSessionCurrent = async (
	bridge: LangflowerBridge,
	session: LangflowerSession,
	store: WorkflowSessionStore,
): Promise<void> => {
	const snapshots = await readWorkflowSessionSnapshots(session, store);
	bridgeEmit(bridge, 'workflowSession.current.snapshot', snapshots.current);
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

/**
 * Boundary observe / point append for one runner event.
 * Called from the always-on `events$` composer in attach (forward first).
 * No bound session appends nothing.
 * The returned promise is the in-flight point write. Detach must await it
 * so `server.close` does not return during `copyFile`.
 */
export const appendSessionPointFromRunnerEvent = (
	bridge: LangflowerBridge,
	session: LangflowerSession,
	progress: RunProgressAccumulator,
	event: RuntimeRunnerEvent,
	resolveDefinition: ResolveNodeDefinition,
	workflowSessions: WorkflowSessionStore,
): Promise<void> | undefined => {
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

	const shouldAppend = progress.observe(
		event,
		boundary === undefined
			? undefined
			: boundary.label !== undefined
				? { label: boundary.label }
				: {},
	);

	const captured = shouldAppend ? progress.snapshot() : undefined;
	const pointWrite =
		captured === undefined
			? undefined
			: appendWorkflowSessionPoint(session, workflowSessions, captured)
					.then(async (result) => {
						if (!result.ok || !result.appended) {
							return;
						}

						await publishWorkflowSessionCurrent(
							bridge,
							session,
							workflowSessions,
						);
					})
					.catch((error: unknown) => {
						const message =
							error instanceof Error
								? error.message
								: String(error);
						process.stderr.write(
							`Langflower workflow session failed: code=WRITE_FAILED ${message}\n`,
						);
					});

	if (isRuntimeDone(event)) {
		progress.clearActive();
	}

	return pointWrite;
};

/**
 * When a run has no `stopsRun` node in scope, the appended finish sink (one per
 * terminal node) ends the run; no `output-emitted` "complete" signal is needed.
 */
export const wireRunnerHandlers = (
	bridge: LangflowerBridge,
	context: ServerContext,
	session: LangflowerSession,
	progress: RunProgressAccumulator,
	workflowSessions: WorkflowSessionStore,
	autosave: WorkflowSessionAutosave,
	flushSessionHead: () => Promise<void>,
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

	subscription.add(
		session.runtime.runner.nodeState$.subscribe((event) => {
			applyWorkflowSessionNodeState(session, event);
		}),
	);

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
			readBoundSessionUpload(session, workflowSessions),
			stageBoundSessionUpload(session, workflowSessions),
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
			nodeStates?: RuntimeNodeStates,
		) => RunId | false;
		readonly announce: (runId: RunId) => void;
	}): Promise<RunId | false> => {
		if (isStartBusy()) {
			return false;
		}

		startHeld = true;
		let started = false;

		try {
			const wasBound = session.binding.kind === 'workflowSession';
			const ensured = await ensureSessionForRun({
				session,
				store: workflowSessions,
				workflowService: context.workflowService,
				resolveDefinition: context.resolveDefinition,
				autosave,
			});

			if (!ensured.ok) {
				bridgeEmit(bridge, 'workflowSession.action.failed', {
					code: ensured.code,
					message: ensured.message,
				});
				return false;
			}

			if (!wasBound && session.binding.kind === 'workflowSession') {
				const snapshots = await readWorkflowSessionSnapshots(
					session,
					workflowSessions,
				);
				bridgeEmit(
					bridge,
					'workflowSession.list.snapshot',
					snapshots.list,
				);
				bridgeEmit(
					bridge,
					'workflowSession.current.snapshot',
					snapshots.current,
				);
				bridgeEmit(
					bridge,
					'executionFeed.snapshot',
					session.buildExecutionFeed(),
				);
			}

			session.runnerStatus = 'running';
			const contextSeeds = await seedLiveContext(args.resolvedRunId);
			const initialPayload = mergeSeeds(contextSeeds, args.clientSeeds);
			if (session.activeWorkflow !== null) {
				progress.beginRun(args.resolvedRunId);
			}

			if (autosave.isDirty()) {
				await autosave.flush();
			}

			if (session.binding.kind === 'workflowSession') {
				await beginSessionFeedRun(
					session,
					workflowSessions,
					args.resolvedRunId,
				);
			}

			const nodeStates =
				session.binding.kind === 'workflowSession'
					? session.headNodeStates
					: undefined;
			const runId = args.start(
				initialPayload,
				args.resolvedRunId,
				nodeStates,
			);
			if (runId === false) {
				return false;
			}

			started = true;
			session.boundFeedSnapshot = undefined;
			session.runId = runId;
			logWorkflowSessionRestoreFailures(session);
			// Same turn as `start()` so `runner.started` precedes port telemetry
			// (wiring flushes on a later microtask). Do not announce after `await`.
			args.announce(runId);
			return runId;
		} finally {
			startHeld = false;
			if (!started) {
				session.runnerStatus = 'idle';
				progress.clearActive();
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
					start: (seeds, id, nodeStates) =>
						session.runtime.runner.start(
							seeds,
							id,
							nodeStates === undefined
								? undefined
								: { nodeStates },
						),
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
					start: (seeds, id, nodeStates) =>
						session.runtime.runner.startNode(
							nodeId,
							seeds,
							id,
							nodeStates === undefined
								? undefined
								: { nodeStates },
						),
					announce: (id) =>
						bridgeEmit(bridge, 'runner.startNode.started', id),
				});
			})();
		}),
	);

	subscription.add(
		bridge['runner.interrupt.requested'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<
						Parameters<RuntimeRunnerApi['interrupt']>[0]
					>(raw)
				) {
					return;
				}

				const connected = findClientById(bridge, raw.clientId);

				if (connected === undefined) {
					return;
				}

				session.runtime.runner.interrupt(raw.payload);
				progress.clearActive();
				try {
					await flushSessionHead();
				} catch {
					// The flush logs its own write failure. The client
					// still has to hear that the run stopped.
				}
				bridgeEmit(bridge, 'runner.interrupted', raw.payload);
			})();
		}),
	);

	subscription.add(
		bridge['runner.resume.requested'].subscribe((raw) => {
			void (async () => {
				if (
					!isInboundEvent<WorkflowSessionResumeRequestedPayload>(raw)
				) {
					return;
				}

				const connected = findClientById(bridge, raw.clientId);

				if (connected === undefined) {
					return;
				}

				const pointId = raw.payload.pointId;

				const fail = (
					code: WorkflowSessionResumeFailedCode,
					message: string,
				): void => {
					clientEmit(connected, 'runner.resume.failed', {
						code,
						message,
						pointId,
					});
				};

				const workflow = session.activeWorkflow;
				const bound = session.binding.kind === 'workflowSession';
				const workflowId = session.activeWorkflowId;

				if (
					!bound ||
					workflow === null ||
					workflowId === undefined ||
					session.binding.kind !== 'workflowSession'
				) {
					const decision = decidePointResume({
						busy: isStartBusy(),
						bound: false,
						corrupt: false,
						point: undefined,
						currentFingerprint: '',
					});

					if (!decision.ok) {
						fail(decision.code, decision.message);
					}

					return;
				}

				const sessionId = session.binding.sessionId;
				const loaded = await workflowSessions.read(
					workflowId,
					sessionId,
				);
				const fingerprint = buildWorkflowFingerprint(
					workflow.graph.nodes,
					workflow.graph.edges,
				);
				const point = loaded.ok
					? loaded.value.points.find(
							(entry) => entry.pointId === pointId,
						)
					: undefined;
				const decision = decidePointResume({
					busy: isStartBusy(),
					bound: true,
					corrupt: !loaded.ok && loaded.code === 'CORRUPT',
					...(!loaded.ok ? { corruptMessage: loaded.message } : {}),
					point,
					currentFingerprint: fingerprint,
				});

				if (!decision.ok) {
					fail(decision.code, decision.message);
					return;
				}

				startHeld = true;
				let started = false;

				try {
					const chosen = decision.point;
					const slice = await workflowSessions.readFeedSlice(
						workflowId,
						sessionId,
						chosen.runOffset,
						chosen.feedOffset,
					);
					const resumedFeed = slice.ok ? slice.value : null;
					session.runtime.runner.seedEventLog(
						resumedFeed?.events ?? [],
					);
					bridgeEmit(bridge, 'executionFeed.snapshot', resumedFeed);
					session.runnerStatus = 'running';

					const contextSeeds = await seedLiveContext(
						chosen.runId as RunId,
					);
					progress.hydrate({
						runId: chosen.runId,
						completedNodeIds: chosen.completedNodeIds,
						outputSnapshots: chosen.outputSnapshots,
					});

					const outputSnapshots: Record<
						string,
						Record<string, unknown>
					> = {};

					for (const [nodeId, ports] of Object.entries(
						chosen.outputSnapshots,
					)) {
						outputSnapshots[nodeId] = Object.fromEntries(
							Object.entries(ports).map(([port, snap]) => [
								port,
								snap.value,
							]),
						);
					}

					const resumed = session.runtime.runner.resume({
						runId: chosen.runId as RunId,
						completedNodeIds: chosen.completedNodeIds as NodeId[],
						outputSnapshots,
						initialPayload: contextSeeds,
						nodeStates: chosen.nodeStates,
					});

					if (resumed === false) {
						fail('BUSY', 'Runner rejected resume');
						return;
					}

					started = true;
					session.runId = resumed;
					await applyPointToSessionHead(
						session,
						workflowSessions,
						chosen,
					);
					logWorkflowSessionRestoreFailures(session);
					bridgeEmit(bridge, 'runner.resume.started', resumed);
				} finally {
					startHeld = false;
					if (!started) {
						session.runnerStatus = 'idle';
						progress.clearActive();
					}
				}
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
				//
				// A reply to a gate that a restored session still shows as waiting
				// recovers the run instead: same run id, work log kept, nodes restored
				// from the session head. See planParkedRecovery.
				if (wasIdle) {
					const recovery = planParkedRecovery(
						session,
						context.resolveDefinition,
						String(pushPayload.nodeId),
					);
					if (recovery !== undefined) {
						session.runtime.runner.seedEventLog(recovery.events);
						session.feedMarkerRunId = recovery.runId;
						session.feedPersistedEvents = recovery.events.length;
					}
					const resolvedRunId =
						recovery?.runId ?? (crypto.randomUUID() as RunId);
					const runId = await beginSeededRun({
						resolvedRunId,
						...(recovery !== undefined
							? { clientSeeds: recovery.seeds }
							: {}),
						start: (seeds, id, nodeStates) =>
							recovery !== undefined
								? session.runtime.runner.resume({
										runId: id,
										completedNodeIds: [],
										outputSnapshots: {},
										initialPayload: seeds,
										...(nodeStates !== undefined
											? { nodeStates }
											: {}),
									})
								: session.runtime.runner.startNode(
										pushPayload.nodeId,
										seeds,
										id,
										nodeStates === undefined
											? undefined
											: { nodeStates },
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

			if (session.binding.kind === 'workflowSession') {
				session.boundFeedSnapshot = null;
				session.feedMarkerRunId = undefined;
				session.feedPersistedEvents = 0;
				session.runId = undefined;
				const workflowId = session.activeWorkflowId;

				if (workflowId !== undefined) {
					void beginSessionFeedRun(
						session,
						workflowSessions,
						crypto.randomUUID(),
					);
				}
			}

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
