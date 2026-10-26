import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import {
	isPortValueTelemetry,
	type RunId,
	type RuntimeRunnerEvent,
	type RuntimeSeedPortValue,
} from '@langflower/runtime';
import type { WorkflowNodePersisted } from '@langflower/shared/types/langflower-workflow.js';
import type { LangflowerSession } from '../session/langflower-session.js';

type ResolveDefinition = (
	node: Pick<WorkflowNodePersisted, 'type' | 'params'>,
) => ReactiveNodeDefinition | undefined;

/**
 * What a recovered run keeps and seeds: the run id and work log to continue,
 * and the seeds that give the agents behind each chat entry their context.
 */
export type ParkedRecovery = {
	readonly runId: RunId;
	readonly events: readonly RuntimeRunnerEvent[];
	readonly seeds: Readonly<Record<string, readonly RuntimeSeedPortValue[]>>;
};

type InputFrame = {
	readonly nodeId: string;
	readonly portId: string;
	readonly value: unknown;
};

/** The `in` frames of the work log, newest first. */
const inputFrames = (events: readonly RuntimeRunnerEvent[]): InputFrame[] =>
	events
		.flatMap((event): InputFrame[] =>
			isPortValueTelemetry(event) &&
			event[0] === 'in' &&
			typeof event[2] === 'string'
				? [
						{
							nodeId: String(event[1]),
							portId: event[2],
							value: event[3].value,
						},
					]
				: [],
		)
		.reverse();

/**
 * Whether the work log shows `nodeId` waiting on a person: it received an
 * input on a non-HITL port with no HITL reply after it. This is the same
 * reading the composer uses to show a restored gate.
 */
const isWaiting = (
	frames: readonly InputFrame[],
	nodeId: string,
	definition: ReactiveNodeDefinition,
): boolean => {
	const hitlPorts = new Set(
		definition.inputsConfigs
			.filter((config) => config.hitl !== undefined)
			.map((config) => String(config.portId)),
	);
	const latest = frames.find((frame) => frame.nodeId === nodeId);
	return latest !== undefined && !hitlPorts.has(latest.portId);
};

/**
 * Plan the recovery of a gate that the restored session still shows as
 * waiting. `undefined` means this reply is not for a waiting gate (a chat
 * entry, a node the log does not show waiting, or no restored work log), and
 * the caller starts a run the ordinary way.
 *
 * The run continues under its stored run id with the restored log, so the
 * log grows instead of being replaced. The nodes restore themselves from the
 * session head: a gate re-opens its own wait, an agent that saved this run id
 * waits for the next turn. Each chat entry is seeded silently with the last
 * message it received in this run, which gives the agents behind it their
 * context without a second user bubble.
 */
export const planParkedRecovery = (
	session: LangflowerSession,
	resolveDefinition: ResolveDefinition,
	nodeId: string,
): ParkedRecovery | undefined => {
	const feed = session.boundFeedSnapshot;
	const workflow = session.activeWorkflow;

	if (
		session.binding.kind !== 'workflowSession' ||
		feed === undefined ||
		feed === null ||
		workflow === null
	) {
		return undefined;
	}

	const target = workflow.graph.nodes.find((node) => node.id === nodeId);
	const targetDefinition =
		target === undefined ? undefined : resolveDefinition(target);
	const frames = inputFrames(feed.events);

	if (
		targetDefinition === undefined ||
		targetDefinition.chatEntry === true ||
		!isWaiting(frames, nodeId, targetDefinition)
	) {
		return undefined;
	}

	const seeds = Object.fromEntries(
		workflow.graph.nodes.flatMap((node) => {
			const input = resolveDefinition(node)?.inputsConfigs.find(
				(config) =>
					config.hitl?.kind === 'textarea' &&
					config.hitl.role === 'chat-start',
			);
			const message =
				typeof input?.portId === 'string'
					? frames.find(
							(frame) =>
								frame.nodeId === node.id &&
								frame.portId === input.portId,
						)?.value
					: undefined;
			return typeof input?.portId === 'string' && message !== undefined
				? [
						[
							node.id,
							[
								{
									portId: input.portId,
									slotIndex: 0,
									value: message,
									silent: true,
								},
							],
						] as const,
					]
				: [];
		}),
	);

	return { runId: feed.runId as RunId, events: feed.events, seeds };
};
