import {
	isLlmRecoverySuspended,
	RECOVERY_PORT_ID,
	STEER_CONTROL_PORT_ID,
} from '@langflower/node-sdk/llm';
import type { RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
import {
	definitionForNode,
	resolveOutputFeedRole,
	type FeedCatalog,
} from '../../../services/execution-catalog';
import {
	hitlReplyReceived,
	nonHitlInputReceived,
	steerControlHitlTransition,
} from '../../../services/hitl-projection';
import { eventsForNode } from './canvas-node-status-projection';

export type NodeHitlAwaitState = {
	readonly awaiting: boolean;
	readonly runId: RunId | null;
};

export const emptyNodeHitlAwaitState = (): NodeHitlAwaitState => ({
	awaiting: false,
	runId: null,
});

const applySteerTransition = (
	awaiting: boolean,
	transition: 'open' | 'close',
): boolean => {
	if (transition === 'open') {
		return true;
	}
	return false;
};

/**
 * Simplified chrome HITL: palette meta + port events for one node only.
 * No optimistic open/resolve, idle chat-entry, or permission asks.
 */
export const applyNodeHitlFrame = (
	state: NodeHitlAwaitState,
	event: RuntimeRunnerEvent,
	catalog: FeedCatalog | null,
	nodeId: string,
): NodeHitlAwaitState => {
	if (catalog === null) {
		return state;
	}
	const def = definitionForNode(
		catalog.paletteByType,
		catalog.nodeTypeById,
		nodeId,
	);
	if (def === undefined) {
		return state;
	}

	if (
		event.kind === 'output-emitted' &&
		typeof event.portId === 'string' &&
		event.state === 'value'
	) {
		const role = resolveOutputFeedRole(
			catalog.paletteByType,
			catalog.nodeTypeById,
			event.nodeId,
			event.portId,
		);
		if (
			(role === 'recovery' || event.portId === RECOVERY_PORT_ID) &&
			isLlmRecoverySuspended(event.value)
		) {
			return { awaiting: true, runId: event.runId };
		}
		return state;
	}

	if (
		event.kind !== 'input-received' ||
		typeof event.portId !== 'string' ||
		event.state !== 'value'
	) {
		return state;
	}

	const steer = steerControlHitlTransition(event.portId, event.value);
	if (steer === 'open' || steer === 'close') {
		return {
			awaiting: applySteerTransition(state.awaiting, steer),
			runId: event.runId,
		};
	}
	if (event.portId === STEER_CONTROL_PORT_ID) {
		return state;
	}
	if (hitlReplyReceived(def, event.portId)) {
		return { awaiting: false, runId: event.runId };
	}
	if (nonHitlInputReceived(def, nodeId, event.portId)) {
		return { awaiting: true, runId: event.runId };
	}
	return state;
};

export const replayNodeHitlFromSnapshot = (
	snapshot: ExecutionFeedSnapshotPayload | null,
	nodeId: string,
	catalog: FeedCatalog | null,
): NodeHitlAwaitState => {
	if (snapshot === null || catalog === null) {
		return emptyNodeHitlAwaitState();
	}
	let state = emptyNodeHitlAwaitState();
	for (const event of eventsForNode(snapshot.events, nodeId)) {
		state = applyNodeHitlFrame(state, event, catalog, nodeId);
	}
	return { ...state, runId: snapshot.runId };
};

export const resetNodeHitlAwaitState = (
	runId: RunId,
	previous: NodeHitlAwaitState,
): NodeHitlAwaitState => {
	if (runId === previous.runId) {
		return previous;
	}
	return { awaiting: false, runId };
};

export const rebuildNodeHitlAwaitState = (
	events: readonly RuntimeRunnerEvent[],
	runId: RunId | null,
	catalog: FeedCatalog,
	nodeId: string,
): NodeHitlAwaitState => {
	let state: NodeHitlAwaitState = { awaiting: false, runId };
	for (const event of events) {
		state = applyNodeHitlFrame(state, event, catalog, nodeId);
	}
	return state;
};
