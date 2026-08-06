import type { NodeId, RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { describe, expect, it } from 'vitest';
import type { FeedCatalog } from '../../../services/execution-catalog';
import {
	appendNodeChromeFrame,
	emptyNodeChromeFoldState,
	eventsForNode,
	foldStatusFromNodeState,
	replayNodeChromeFromSnapshot,
} from '../operators/canvas-node-status-projection';

const runId = 'r1' as RunId;
const nodeId = 'n1' as NodeId;
const otherId = 'n2' as NodeId;
const noEdges: never[] = [];

const emptyCatalog = (): FeedCatalog => ({
	labels: new Map(),
	paletteByType: new Map(),
	nodeTypeById: new Map([['n1', 'agent']]),
});

const agentDef = {
	type: 'agent',
	displayName: 'Agent',
	category: 'llm',
	source: 'system',
	uiSchema: [],
	inputsConfigs: [],
	outputsConfigs: [
		{
			dir: 'out',
			portId: 'draft',
			wireType: 'string',
			feed: { role: 'draft', streaming: true },
		},
		{
			dir: 'out',
			portId: 'result',
			wireType: 'string',
			feed: { role: 'result' },
		},
	],
	bypassPorts: {},
	emitOncePerActivation: false,
	stopsRun: false,
	chatEntry: false,
} as unknown as PaletteNodeDefinition;

const catalogWithStreamingDraft = (): FeedCatalog => ({
	labels: new Map([['n1', 'Agent']]),
	nodeTypeById: new Map([['n1', 'agent']]),
	paletteByType: new Map([['agent', agentDef]]),
});

describe('canvas-node-status-projection (single-node)', () => {
	it('marks pending on any input-received', () => {
		const state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			{
				kind: 'input-received',
				runId,
				nodeId,
				portId: 'prompt',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'hi',
			},
			emptyCatalog(),
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
	});

	it('keeps pending for streaming output value', () => {
		let state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			{
				kind: 'output-emitted',
				runId,
				nodeId,
				portId: 'draft',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'tok',
				feed: { role: 'draft', streaming: true },
			},
			catalogWithStreamingDraft(),
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');

		state = appendNodeChromeFrame(
			state,
			{
				kind: 'output-emitted',
				runId,
				nodeId,
				portId: 'draft',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'tok2',
				feed: { role: 'draft', streaming: true },
			},
			catalogWithStreamingDraft(),
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
	});

	it('turns value on non-streaming output', () => {
		const state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			{
				kind: 'output-emitted',
				runId,
				nodeId,
				portId: 'result',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'done',
			},
			catalogWithStreamingDraft(),
		);
		expect(foldStatusFromNodeState(state)).toBe('value');
	});

	it('resolves streaming from palette when event.feed absent', () => {
		const state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			{
				kind: 'output-emitted',
				runId,
				nodeId,
				portId: 'draft',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'tok',
			},
			catalogWithStreamingDraft(),
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
	});

	it('error wins over value', () => {
		let state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			{
				kind: 'output-emitted',
				runId,
				nodeId,
				portId: 'result',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'x',
			},
			emptyCatalog(),
		);
		state = appendNodeChromeFrame(
			state,
			{
				kind: 'output-emitted',
				runId,
				nodeId,
				portId: 'result',
				portIdx: 0,
				edgeIds: [],
				state: 'error',
				value: undefined,
			},
			emptyCatalog(),
		);
		expect(foldStatusFromNodeState(state)).toBe('error');
	});

	it('filters snapshot events to one node', () => {
		const state = replayNodeChromeFromSnapshot(
			{
				runId,
				workflowId: 'w1',
				status: 'completed',
				events: [
					{
						kind: 'output-emitted',
						runId,
						nodeId: otherId,
						portId: 'result',
						portIdx: 0,
						edgeIds: noEdges,
						state: 'value',
						value: 'other',
					},
					{
						kind: 'output-emitted',
						runId,
						nodeId,
						portId: 'draft',
						portIdx: 0,
						edgeIds: noEdges,
						state: 'value',
						value: 'partial',
						feed: { streaming: true },
					},
				],
			},
			'n1',
			catalogWithStreamingDraft(),
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
		expect(
			eventsForNode(
				[
					{
						kind: 'output-emitted',
						runId,
						nodeId: otherId,
						portId: 'result',
						portIdx: 0,
						edgeIds: noEdges,
						state: 'value',
						value: 'other',
					},
					{
						kind: 'output-emitted',
						runId,
						nodeId,
						portId: 'draft',
						portIdx: 0,
						edgeIds: noEdges,
						state: 'value',
						value: 'partial',
						feed: { streaming: true },
					},
				],
				'n1',
			),
		).toHaveLength(1);
	});

	it('returns to pending when input arrives after a settled result', () => {
		let state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			{
				kind: 'output-emitted',
				runId,
				nodeId,
				portId: 'result',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'done',
			},
			catalogWithStreamingDraft(),
		);
		expect(foldStatusFromNodeState(state)).toBe('value');

		state = appendNodeChromeFrame(
			state,
			{
				kind: 'input-received',
				runId,
				nodeId,
				portId: 'feedback',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'revise this',
			},
			catalogWithStreamingDraft(),
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
	});

	it('snapshot replay matches append sequence for one node', () => {
		const events: RuntimeRunnerEvent[] = [
			{
				kind: 'input-received',
				runId,
				nodeId,
				portId: 'prompt',
				portIdx: 0,
				edgeIds: noEdges,
				state: 'value',
				value: 'hi',
			},
			{
				kind: 'output-emitted',
				runId,
				nodeId,
				portId: 'draft',
				portIdx: 0,
				edgeIds: noEdges,
				state: 'value',
				value: 'a',
				feed: { streaming: true },
			},
			{
				kind: 'output-emitted',
				runId,
				nodeId,
				portId: 'result',
				portIdx: 1,
				edgeIds: noEdges,
				state: 'value',
				value: 'final',
			},
		];
		let appended = emptyNodeChromeFoldState();
		for (const event of events) {
			appended = appendNodeChromeFrame(
				appended,
				event,
				catalogWithStreamingDraft(),
			);
		}
		const replayed = replayNodeChromeFromSnapshot(
			{
				runId,
				workflowId: 'w1',
				status: 'running',
				events,
			},
			'n1',
			catalogWithStreamingDraft(),
		);
		expect(foldStatusFromNodeState(replayed)).toBe(
			foldStatusFromNodeState(appended),
		);
		expect(foldStatusFromNodeState(replayed)).toBe('value');
	});
});
