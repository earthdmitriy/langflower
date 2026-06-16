import { describe, expect, it } from 'vitest';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { formatHitlUserText } from '../execution-catalog';
import {
	gateHitlControlsForNode,
	hitlControlsForNode,
	hitlReplyReceived,
	nonHitlInputReceived,
	steerControlHitlTransition,
} from '../hitl-projection';

function definitionWith(inputs: readonly unknown[]): PaletteNodeDefinition {
	return {
		type: 'test',
		displayName: 'Test',
		category: 'Test',
		icon: undefined,
		uiSchema: [],
		emitOncePerActivation: false,
		stopsRun: false,
		bypassPorts: {},
		inputsConfigs: inputs as PaletteNodeDefinition['inputsConfigs'],
		outputsConfigs: [],
		source: 'system',
	} as unknown as PaletteNodeDefinition;
}

describe('hitl-projection', () => {
	it('returns every hitl-marked input, ignoring data ports', () => {
		const def = definitionWith([
			{
				portId: 'question',
				name: 'Question',
				wireType: 'string',
			},
			{
				portId: 'approve',
				name: 'Approve',
				wireType: 'any',
				hitl: { kind: 'button', label: 'Approve', payload: 'approve' },
			},
			{
				portId: 'reject',
				name: 'Reject',
				wireType: 'any',
				hitl: { kind: 'button', label: 'Reject', payload: 'reject' },
			},
		]);

		const controls = hitlControlsForNode('n1', def);

		expect(controls.map((c) => c.portId)).toEqual(['approve', 'reject']);
		expect(controls.every((c) => c.nodeId === 'n1')).toBe(true);
	});

	it('returns empty when the node has no hitl inputs', () => {
		const def = definitionWith([
			{ portId: 'in', name: 'In', wireType: 'string' },
		]);

		expect(hitlControlsForNode('n1', def)).toEqual([]);
	});

	it('triggers only on a wired value into a non-hitl input', () => {
		const def = definitionWith([
			{ portId: 'in', name: 'In', wireType: 'string' },
			{
				portId: 'reply',
				name: 'Reply',
				wireType: 'string',
				hitl: { kind: 'textarea', title: 'Reply', submitLabel: 'Send' },
			},
		]);

		expect(nonHitlInputReceived(def, 'n1', 'in')).toBe(true);
		expect(nonHitlInputReceived(def, 'n1', 'reply')).toBe(false);
		expect(nonHitlInputReceived(def, 'n1', 'missing')).toBe(false);
		expect(hitlReplyReceived(def, 'reply')).toBe(true);
		expect(hitlReplyReceived(def, 'in')).toBe(false);
		expect(hitlReplyReceived(def, 'missing')).toBe(false);
	});

	it('steerControl pause opens and steer/resume close (ADR-032)', () => {
		expect(
			steerControlHitlTransition('steerControl', { kind: 'pause' }),
		).toBe('open');
		expect(
			steerControlHitlTransition('steerControl', {
				kind: 'steer',
				text: 'fix it',
			}),
		).toBe('close');
		expect(
			steerControlHitlTransition('steerControl', { kind: 'resume' }),
		).toBe('close');
		expect(steerControlHitlTransition('steerControl', null)).toBe('ignore');
		expect(steerControlHitlTransition('reply', { kind: 'pause' })).toBe(
			'ignore',
		);
	});

	it('LLM with only steerControl does not open on ordinary wired input', () => {
		const def = definitionWith([
			{ portId: 'userPrompt', name: 'userPrompt', wireType: 'string' },
			{
				portId: 'steerControl',
				name: 'Steer',
				wireType: 'any',
				hitl: {
					kind: 'textarea',
					title: 'Steer',
					submitLabel: 'Send',
				},
			},
		]);

		expect(nonHitlInputReceived(def, 'helper', 'userPrompt')).toBe(false);
		expect(gateHitlControlsForNode('helper', def)).toEqual([]);
		expect(hitlControlsForNode('helper', def).map((c) => c.portId)).toEqual(
			['steerControl'],
		);
	});

	it('Review-style gate still opens on non-HITL input without steer', () => {
		const def = definitionWith([
			{ portId: 'preview', name: 'Preview', wireType: 'string' },
			{
				portId: 'feedback',
				name: 'Feedback',
				wireType: 'string',
				hitl: {
					kind: 'textarea',
					title: 'Feedback',
					submitLabel: 'Send',
				},
			},
		]);

		expect(nonHitlInputReceived(def, 'review', 'preview')).toBe(true);
	});

	it('gate HITL plus steerControl still opens on non-HITL; Steer remains projectable', () => {
		const def = definitionWith([
			{ portId: 'in', name: 'In', wireType: 'string' },
			{
				portId: 'reply',
				name: 'Reply',
				wireType: 'string',
				hitl: { kind: 'textarea', title: 'Reply', submitLabel: 'Send' },
			},
			{
				portId: 'steerControl',
				name: 'Steer',
				wireType: 'any',
				hitl: {
					kind: 'textarea',
					title: 'Steer',
					submitLabel: 'Send',
				},
			},
		]);

		expect(nonHitlInputReceived(def, 'n1', 'in')).toBe(true);
		expect(gateHitlControlsForNode('n1', def).map((c) => c.portId)).toEqual(
			['reply'],
		);
		expect(hitlControlsForNode('n1', def).map((c) => c.portId)).toEqual([
			'reply',
			'steerControl',
		]);
	});

	it('formatHitlUserText uses SteerControlPayload owner guards', () => {
		const def = definitionWith([
			{
				portId: 'steerControl',
				name: 'Steer',
				wireType: 'any',
				hitl: {
					kind: 'textarea',
					title: 'Steer',
					submitLabel: 'Send',
				},
			},
		]);
		expect(formatHitlUserText(def, 'steerControl', { kind: 'pause' })).toBe(
			'',
		);
		expect(
			formatHitlUserText(def, 'steerControl', { kind: 'resume' }),
		).toBe('');
		expect(
			formatHitlUserText(def, 'steerControl', {
				kind: 'steer',
				text: '  go  ',
			}),
		).toBe('go');
	});
});
