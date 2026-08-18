import type { NodeId, RunId } from '@langflower/runtime';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { STEER_CONTROL_PORT_ID } from '@langflower/node-sdk/llm';
import { describe, expect, it } from 'vitest';
import type { FeedCatalog } from '../../../services/execution-catalog';
import {
	applyNodeHitlFrame,
	emptyNodeHitlAwaitState,
	replayNodeHitlFromSnapshot,
	resetNodeHitlAwaitState,
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
			['in', nodeId, 'prompt', { value: 'hi' }, 0, [], null],
			catalog(),
			nodeId,
			runId,
		);
		expect(next.awaiting).toBe(true);
	});

	it('closes on HITL reply input-received', () => {
		let state = applyNodeHitlFrame(
			emptyNodeHitlAwaitState(),
			['in', nodeId, 'prompt', { value: 'hi' }, 0, [], null],
			catalog(),
			nodeId,
			runId,
		);
		state = applyNodeHitlFrame(
			state,
			['in', nodeId, 'reply', { value: 'answer' }, 0, [], null],
			catalog(),
			nodeId,
			runId,
		);
		expect(state.awaiting).toBe(false);
	});

	it('opens on steerControl pause and closes on steer', () => {
		let state = applyNodeHitlFrame(
			emptyNodeHitlAwaitState(),
			[
				'in',
				nodeId,
				STEER_CONTROL_PORT_ID,
				{ value: { kind: 'pause' } },
				0,
				[],
				null,
			],
			catalog(),
			nodeId,
			runId,
		);
		expect(state.awaiting).toBe(true);

		state = applyNodeHitlFrame(
			state,
			[
				'in',
				nodeId,
				STEER_CONTROL_PORT_ID,
				{ value: { kind: 'steer', text: 'go' } },
				0,
				[],
				null,
			],
			catalog(),
			nodeId,
			runId,
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
					['in', nodeId, 'prompt', { value: 'hi' }, 0, [], null],
					[
						'in',
						'other' as NodeId,
						'prompt',
						{ value: 'ignore' },
						0,
						[],
						null,
					],
				],
			},
			nodeId,
			catalog(),
		);
		expect(state.awaiting).toBe(true);
		expect(state.runId).toBe(runId);
	});

	it('adopts started runId without clearing a live await', () => {
		const opened = applyNodeHitlFrame(
			emptyNodeHitlAwaitState(),
			['in', nodeId, 'prompt', { value: 'hi' }, 0, [], null],
			catalog(),
			nodeId,
			null,
		);
		expect(opened.awaiting).toBe(true);
		expect(opened.runId).toBeNull();

		const adopted = resetNodeHitlAwaitState(runId, opened);
		expect(adopted.awaiting).toBe(true);
		expect(adopted.runId).toBe(runId);

		const nextRun = resetNodeHitlAwaitState('r2' as RunId, adopted);
		expect(nextRun.awaiting).toBe(false);
		expect(nextRun.runId).toBe('r2');
	});
});
