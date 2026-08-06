import type { NodeId, RunId } from '@langflower/runtime';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
import { describe, expect, it } from 'vitest';
import type { FeedCatalog } from '../../../services/execution-catalog';
import {
	applyNodeHitlFrame,
	emptyNodeHitlAwaitState,
	replayNodeHitlFromSnapshot,
} from '../operators/canvas-node-hitl-projection';

const runId = 'r1' as RunId;
const nodeId = 'n1' as NodeId;

const agentDef = {
	type: 'agent',
	displayName: 'Agent',
	category: 'llm',
	source: 'system',
	uiSchema: [],
	inputsConfigs: [
		{ dir: 'in', portId: 'prompt', wireType: 'string' },
		{
			dir: 'in',
			portId: 'reply',
			wireType: 'string',
			hitl: { kind: 'text' },
		},
		{ dir: 'in', portId: STEER_CONTROL_PORT_ID, wireType: 'object' },
	],
	outputsConfigs: [],
	bypassPorts: {},
	emitOncePerActivation: false,
	stopsRun: false,
	chatEntry: false,
} as unknown as PaletteNodeDefinition;

const catalog = (): FeedCatalog => ({
	labels: new Map([[nodeId, 'Agent']]),
	nodeTypeById: new Map([[nodeId, 'agent']]),
	paletteByType: new Map([['agent', agentDef]]),
});

describe('canvas-node-hitl-projection (single-node)', () => {
	it('opens on non-HITL wired input-received', () => {
		const next = applyNodeHitlFrame(
			emptyNodeHitlAwaitState(),
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
			catalog(),
			nodeId,
		);
		expect(next.awaiting).toBe(true);
	});

	it('closes on HITL reply input-received', () => {
		let state = applyNodeHitlFrame(
			emptyNodeHitlAwaitState(),
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
			catalog(),
			nodeId,
		);
		state = applyNodeHitlFrame(
			state,
			{
				kind: 'input-received',
				runId,
				nodeId,
				portId: 'reply',
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: 'answer',
			},
			catalog(),
			nodeId,
		);
		expect(state.awaiting).toBe(false);
	});

	it('opens on steerControl pause and closes on steer', () => {
		let state = applyNodeHitlFrame(
			emptyNodeHitlAwaitState(),
			{
				kind: 'input-received',
				runId,
				nodeId,
				portId: STEER_CONTROL_PORT_ID,
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: { kind: 'pause' },
			},
			catalog(),
			nodeId,
		);
		expect(state.awaiting).toBe(true);

		state = applyNodeHitlFrame(
			state,
			{
				kind: 'input-received',
				runId,
				nodeId,
				portId: STEER_CONTROL_PORT_ID,
				portIdx: 0,
				edgeIds: [],
				state: 'value',
				value: { kind: 'steer', text: 'go' },
			},
			catalog(),
			nodeId,
		);
		expect(state.awaiting).toBe(false);
	});

	it('replays node-scoped HITL from snapshot', () => {
		const state = replayNodeHitlFromSnapshot(
			{
				runId,
				workflowId: 'wf-1',
				status: 'running',
				events: [
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
					{
						kind: 'input-received',
						runId,
						nodeId: 'other' as NodeId,
						portId: 'prompt',
						portIdx: 0,
						edgeIds: [],
						state: 'value',
						value: 'ignore',
					},
				],
			},
			nodeId,
			catalog(),
		);
		expect(state.awaiting).toBe(true);
		expect(state.runId).toBe(runId);
	});
});
