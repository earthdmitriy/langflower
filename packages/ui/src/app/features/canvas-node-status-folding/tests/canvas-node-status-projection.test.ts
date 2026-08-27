import type {
	EdgeId,
	NodeId,
	RunId,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { describe, expect, it } from 'vitest';
import type { FeedCatalog } from '../../../services/execution-catalog';
import {
	appendNodeChromeFrame,
	emptyNodeChromeFoldState,
	eventsForNode,
	foldStatusFromNodeState,
	resetNodeChromeFoldState,
	replayNodeChromeFromSnapshot,
} from '../operators/canvas-node-status-projection';

const runId = 'r1' as RunId;
const nodeId = 'n1' as NodeId;
const otherId = 'n2' as NodeId;

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
			['in', nodeId, 'prompt', { value: 'hi' }, 0, [], null],
			emptyCatalog(),
			null,
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
	});

	it('keeps pending for streaming output value', () => {
		let state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			[
				'out',
				nodeId,
				'draft',
				{ value: 'tok' },
				0,
				[],
				{ role: 'draft', streaming: true },
			],
			catalogWithStreamingDraft(),
			null,
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');

		state = appendNodeChromeFrame(
			state,
			[
				'out',
				nodeId,
				'draft',
				{ value: 'tok2' },
				0,
				[],
				{ role: 'draft', streaming: true },
			],
			catalogWithStreamingDraft(),
			null,
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
	});

	it('turns value on non-streaming output', () => {
		const state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			['out', nodeId, 'result', { value: 'done' }, 0, [], null],
			catalogWithStreamingDraft(),
			null,
		);
		expect(foldStatusFromNodeState(state)).toBe('value');
	});

	it('resolves streaming from palette when event.feed absent', () => {
		const state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			['out', nodeId, 'draft', { value: 'tok' }, 0, [], null],
			catalogWithStreamingDraft(),
			null,
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
	});

	it('error wins over value', () => {
		let state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			['out', nodeId, 'result', { value: 'x' }, 0, [], null],
			emptyCatalog(),
			null,
		);
		state = appendNodeChromeFrame(
			state,
			['out', nodeId, 'result', { error: undefined }, 0, [], null],
			emptyCatalog(),
			null,
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
					['out', otherId, 'result', { value: 'other' }, 0, [], null],
					[
						'out',
						nodeId,
						'draft',
						{ value: 'partial' },
						0,
						[],
						{ streaming: true },
					],
				],
			},
			'n1',
			catalogWithStreamingDraft(),
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
		expect(
			eventsForNode(
				[
					['out', otherId, 'result', { value: 'other' }, 0, [], null],
					[
						'out',
						nodeId,
						'draft',
						{ value: 'partial' },
						0,
						[],
						{ streaming: true },
					],
				],
				'n1',
			),
		).toHaveLength(1);
	});

	it('returns to pending when output pending arrives after a settled result', () => {
		let state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			['out', nodeId, 'result', { value: 'done' }, 0, [], null],
			catalogWithStreamingDraft(),
			null,
		);
		expect(foldStatusFromNodeState(state)).toBe('value');

		state = appendNodeChromeFrame(
			state,
			['out', nodeId, 'result', { pending: true }, 0, [], null],
			catalogWithStreamingDraft(),
			null,
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
	});

	it('returns to pending when input arrives after a settled result', () => {
		let state = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			['out', nodeId, 'result', { value: 'done' }, 0, [], null],
			catalogWithStreamingDraft(),
			null,
		);
		expect(foldStatusFromNodeState(state)).toBe('value');

		state = appendNodeChromeFrame(
			state,
			['in', nodeId, 'feedback', { value: 'revise this' }, 0, [], null],
			catalogWithStreamingDraft(),
			null,
		);
		expect(foldStatusFromNodeState(state)).toBe('pending');
	});

	it('snapshot replay matches append sequence for one node', () => {
		const events: RuntimeRunnerEvent[] = [
			['in', nodeId, 'prompt', { value: 'hi' }, 0, [], null],
			[
				'out',
				nodeId,
				'draft',
				{ value: 'a' },
				0,
				[],
				{ role: 'draft', streaming: true },
			],
			['out', nodeId, 'result', { value: 'final' }, 1, [], null],
		];
		let appended = emptyNodeChromeFoldState();
		for (const event of events) {
			appended = appendNodeChromeFrame(
				appended,
				event,
				catalogWithStreamingDraft(),
				null,
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

	it('string settles to value while review-gate stays pending', () => {
		const stringId = 'string-1' as NodeId;
		const gateId = 'gate-1' as NodeId;
		const triggerEdge = 'e-trigger' as EdgeId;
		const okEdge = 'e-ok' as EdgeId;
		const failEdge = 'e-fail' as EdgeId;
		const catalog: FeedCatalog = {
			labels: new Map(),
			paletteByType: new Map(),
			nodeTypeById: new Map([
				['string-1', 'common-string'],
				['gate-1', 'langflower-review-gate'],
			]),
		};
		const frames: RuntimeRunnerEvent[] = [
			[
				'out',
				stringId,
				'value',
				{ pending: true },
				0,
				[triggerEdge],
				null,
			],
			['out', stringId, 'value', { value: '1' }, 0, [triggerEdge], null],
			['in', gateId, 'trigger', { value: '1' }, 0, [triggerEdge], null],
			['out', gateId, 'ok', { pending: true }, 0, [okEdge], null],
			['out', gateId, 'fail', { pending: true }, 0, [failEdge], null],
		];
		let stringState = emptyNodeChromeFoldState();
		let gateState = emptyNodeChromeFoldState();
		for (const event of eventsForNode(frames, 'string-1')) {
			stringState = appendNodeChromeFrame(
				stringState,
				event,
				catalog,
				null,
			);
		}
		for (const event of eventsForNode(frames, 'gate-1')) {
			gateState = appendNodeChromeFrame(gateState, event, catalog, null);
		}
		expect(foldStatusFromNodeState(stringState)).toBe('value');
		expect(foldStatusFromNodeState(gateState)).toBe('pending');
	});

	it('adopts started runId without clearing a live pending prefix', () => {
		const pending = appendNodeChromeFrame(
			emptyNodeChromeFoldState(),
			['out', nodeId, 'result', { pending: true }, 0, [], null],
			emptyCatalog(),
			null,
		);
		expect(foldStatusFromNodeState(pending)).toBe('pending');

		const adopted = resetNodeChromeFoldState(runId, pending);
		expect(adopted.runId).toBe(runId);
		expect(foldStatusFromNodeState(adopted)).toBe('pending');

		const nextRun = resetNodeChromeFoldState('r2' as RunId, adopted);
		expect(foldStatusFromNodeState(nextRun)).toBe('inactive');
		expect(nextRun.runId).toBe('r2');
	});
});
