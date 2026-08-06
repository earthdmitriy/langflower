import type { RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
import {
	definitionForNode,
	type FeedCatalog,
} from '../../../services/execution-catalog';
import type { CanvasNodeFoldStatus, NodeChromeFoldState } from '../types';

type PortFrame = Extract<
	RuntimeRunnerEvent,
	{ kind: 'output-emitted' | 'input-received' }
>;

export const emptyNodeChromeFoldState = (): NodeChromeFoldState => ({
	seen: false,
	hasError: false,
	hasNonStreamingValue: false,
	runId: null,
});

export const foldStatusFromNodeState = (
	state: NodeChromeFoldState,
): CanvasNodeFoldStatus => {
	if (!state.seen) {
		return 'inactive';
	}
	if (state.hasError) {
		return 'error';
	}
	if (state.hasNonStreamingValue) {
		return 'value';
	}
	return 'pending';
};

const isStreamingPort = (
	event: PortFrame,
	catalog: FeedCatalog | null,
): boolean => {
	if (event.feed?.streaming === true) {
		return true;
	}
	if (catalog === null || typeof event.portId !== 'string') {
		return false;
	}
	const definition = definitionForNode(
		catalog.paletteByType,
		catalog.nodeTypeById,
		event.nodeId,
	);
	const configs =
		event.kind === 'output-emitted'
			? definition?.outputsConfigs
			: definition?.inputsConfigs;
	const config = configs?.find((entry) => entry.portId === event.portId);
	return config?.feed?.streaming === true;
};

/** Append one already-filtered (this node) port frame into single-node state. */
export const appendNodeChromeFrame = (
	state: NodeChromeFoldState,
	event: RuntimeRunnerEvent,
	catalog: FeedCatalog | null,
): NodeChromeFoldState => {
	if (event.kind !== 'output-emitted' && event.kind !== 'input-received') {
		return state;
	}
	if (typeof event.portId === 'symbol') {
		return state;
	}
	if (
		event.state !== 'value' &&
		event.state !== 'pending' &&
		event.state !== 'error'
	) {
		return state;
	}
	if (event.state === 'error' && event.kind === 'output-emitted') {
		return {
			seen: true,
			hasError: true,
			hasNonStreamingValue: state.hasNonStreamingValue,
			runId: event.runId,
		};
	}
	if (
		event.kind === 'output-emitted' &&
		event.state === 'value' &&
		!isStreamingPort(event, catalog)
	) {
		return {
			seen: true,
			hasError: state.hasError,
			hasNonStreamingValue: true,
			runId: event.runId,
		};
	}
	if (event.kind === 'input-received') {
		return {
			seen: true,
			hasError: state.hasError,
			hasNonStreamingValue: false,
			runId: event.runId,
		};
	}
	return {
		seen: true,
		hasError: state.hasError,
		hasNonStreamingValue: state.hasNonStreamingValue,
		runId: event.runId,
	};
};

export const eventsForNode = (
	events: readonly RuntimeRunnerEvent[],
	nodeId: string,
): readonly RuntimeRunnerEvent[] =>
	events.filter((event) => {
		if (
			event.kind !== 'output-emitted' &&
			event.kind !== 'input-received'
		) {
			return false;
		}
		return event.nodeId === nodeId;
	});

/** Replay snapshot events belonging to one node only. */
export const replayNodeChromeFromSnapshot = (
	snapshot: ExecutionFeedSnapshotPayload | null,
	nodeId: string,
	catalog: FeedCatalog | null,
): NodeChromeFoldState => {
	if (snapshot === null) {
		return emptyNodeChromeFoldState();
	}
	let state: NodeChromeFoldState = {
		...emptyNodeChromeFoldState(),
		runId: snapshot.runId,
	};
	for (const event of eventsForNode(snapshot.events, nodeId)) {
		state = appendNodeChromeFrame(state, event, catalog);
	}
	return state;
};

export const resetNodeChromeFoldState = (
	runId: RunId,
	previous: NodeChromeFoldState,
): NodeChromeFoldState => {
	if (runId === previous.runId) {
		return previous;
	}
	return { ...emptyNodeChromeFoldState(), runId };
};

/** Re-apply retained node-filtered events when catalog arrives/changes. */
export const rebuildNodeChromeFoldState = (
	events: readonly RuntimeRunnerEvent[],
	runId: RunId | null,
	catalog: FeedCatalog,
): NodeChromeFoldState => {
	let state: NodeChromeFoldState = {
		...emptyNodeChromeFoldState(),
		runId,
	};
	for (const event of events) {
		state = appendNodeChromeFrame(state, event, catalog);
	}
	return state;
};
