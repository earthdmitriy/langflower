import type { RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import { isPortTelemetry } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/langflower';
import {
	definitionForNode,
	type FeedCatalog,
} from '../../../services/execution-catalog';
import type { CanvasNodeFoldStatus, NodeChromeFoldState } from '../types';

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
	event: RuntimeRunnerEvent,
	catalog: FeedCatalog | null,
): boolean => {
	if (!isPortTelemetry(event)) {
		return false;
	}
	const [, nodeId, portId, , , , feedMeta] = event;
	if (feedMeta?.streaming === true) {
		return true;
	}
	if (catalog === null || typeof portId !== 'string') {
		return false;
	}
	const definition = definitionForNode(
		catalog.paletteByType,
		catalog.nodeTypeById,
		nodeId,
	);
	const configs =
		event[0] === 'out'
			? definition?.outputsConfigs
			: definition?.inputsConfigs;
	const config = configs?.find((entry) => entry.portId === portId);
	return config?.feed?.streaming === true;
};

export const appendNodeChromeFrame = (
	state: NodeChromeFoldState,
	event: RuntimeRunnerEvent,
	catalog: FeedCatalog | null,
	runId: RunId | null,
): NodeChromeFoldState => {
	if (!isPortTelemetry(event)) {
		return state;
	}
	const [portDir, , portId, response] = event;
	if (typeof portId === 'symbol') {
		return state;
	}
	if (
		!('value' in response) &&
		!('pending' in response) &&
		!('error' in response)
	) {
		return state;
	}
	if ('error' in response && portDir === 'out') {
		return {
			seen: true,
			hasError: true,
			hasNonStreamingValue: state.hasNonStreamingValue,
			runId: runId ?? state.runId,
		};
	}
	if (portDir === 'out' && 'pending' in response) {
		return {
			seen: true,
			hasError: state.hasError,
			hasNonStreamingValue: false,
			runId: runId ?? state.runId,
		};
	}
	if (
		portDir === 'out' &&
		'value' in response &&
		!isStreamingPort(event, catalog)
	) {
		return {
			seen: true,
			hasError: state.hasError,
			hasNonStreamingValue: true,
			runId: runId ?? state.runId,
		};
	}
	if (portDir === 'in') {
		return {
			seen: true,
			hasError: state.hasError,
			hasNonStreamingValue: false,
			runId: runId ?? state.runId,
		};
	}
	return {
		seen: true,
		hasError: state.hasError,
		hasNonStreamingValue: state.hasNonStreamingValue,
		runId: runId ?? state.runId,
	};
};

export const eventsForNode = (
	events: readonly RuntimeRunnerEvent[],
	nodeId: string,
): readonly RuntimeRunnerEvent[] =>
	events.filter((event) => isPortTelemetry(event) && event[1] === nodeId);

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
		state = appendNodeChromeFrame(state, event, catalog, snapshot.runId);
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
	if (previous.runId === null) {
		return { ...previous, runId };
	}
	return { ...emptyNodeChromeFoldState(), runId };
};

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
		state = appendNodeChromeFrame(state, event, catalog, runId);
	}
	return state;
};
