import {
	isLlmRecoverySuspended,
	RECOVERY_PORT_ID,
	STEER_CONTROL_PORT_ID,
} from '@langflower/node-sdk/llm';
import type { RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import { isPortTelemetry } from '@langflower/runtime';
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
): boolean => transition === 'open';

export const applyNodeHitlFrame = (
	state: NodeHitlAwaitState,
	event: RuntimeRunnerEvent,
	catalog: FeedCatalog | null,
	nodeId: string,
	runId: RunId | null,
): NodeHitlAwaitState => {
	if (catalog === null || !isPortTelemetry(event)) {
		return state;
	}
	const [portDir, eventNodeId, portId, response] = event;
	const effectiveRunId = runId ?? state.runId;
	const def = definitionForNode(
		catalog.paletteByType,
		catalog.nodeTypeById,
		nodeId,
	);
	if (def === undefined) {
		return state;
	}

	if (
		portDir === 'out' &&
		typeof portId === 'string' &&
		'value' in response
	) {
		const role = resolveOutputFeedRole(
			catalog.paletteByType,
			catalog.nodeTypeById,
			eventNodeId,
			portId,
		);
		if (
			(role === 'recovery' || portId === RECOVERY_PORT_ID) &&
			isLlmRecoverySuspended(response.value)
		) {
			return { awaiting: true, runId: effectiveRunId };
		}
		return state;
	}

	if (
		portDir !== 'in' ||
		typeof portId !== 'string' ||
		!('value' in response)
	) {
		return state;
	}

	const steer = steerControlHitlTransition(portId, response.value);
	if (steer === 'open' || steer === 'close') {
		return {
			awaiting: applySteerTransition(state.awaiting, steer),
			runId: effectiveRunId,
		};
	}
	if (portId === STEER_CONTROL_PORT_ID) {
		return state;
	}
	if (hitlReplyReceived(def, portId)) {
		return { awaiting: false, runId: effectiveRunId };
	}
	if (nonHitlInputReceived(def, nodeId, portId)) {
		return { awaiting: true, runId: effectiveRunId };
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
		state = applyNodeHitlFrame(
			state,
			event,
			catalog,
			nodeId,
			snapshot.runId,
		);
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
	if (previous.runId === null) {
		return { ...previous, runId };
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
		state = applyNodeHitlFrame(state, event, catalog, nodeId, runId);
	}
	return state;
};
