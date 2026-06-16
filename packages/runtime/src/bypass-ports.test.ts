import { describe, expect, it } from 'vitest';
import {
	bypassEdgePort,
	bypassOutputPortId,
	bypassOutputPortIdFromSlot,
	bypassSlot,
	bypassSlotFromEdgePort,
	bypassSlotKey,
	bypassSlotKeyFromEdgePort,
	checkpointPortIdForSlot,
	parseBypassOutputPortId,
} from './bypass-ports.js';
import { parseSlotKey } from './port-meta.js';
import type { NodeId, RuntimeNode } from './types.js';

const nodeR = 'R' as NodeId;

describe('bypass slot identity', () => {
	it('round-trips edge ↔ outputPortId ↔ SlotKey', () => {
		const edgePort = ['ch', 1] as const;
		const slot = bypassSlotFromEdgePort(edgePort);

		expect(slot).toEqual({ basePortId: 'ch', slotIndex: 1 });
		expect(bypassEdgePort(slot)).toEqual(edgePort);

		const outputPortId = bypassOutputPortIdFromSlot(slot);
		expect(outputPortId).toBe('ch@1');
		expect(bypassOutputPortId('ch', 1)).toBe('ch@1');
		expect(parseBypassOutputPortId(outputPortId)).toEqual(slot);

		const key = bypassSlotKeyFromEdgePort(nodeR, edgePort);
		expect(key).toBe('R.ch@1');
		expect(bypassSlotKey(nodeR, 'ch', 1)).toBe(key);

		const parsed = parseSlotKey(key);
		expect(parsed).toEqual({
			nodeId: 'R',
			portId: 'ch',
			slotIndex: 1,
		});
		expect(bypassOutputPortId(parsed.portId, parsed.slotIndex)).toBe(
			outputPortId,
		);
	});

	it('keeps slot 0 as bare base in all three encodings', () => {
		const slot = bypassSlot('ch', 0);

		expect(bypassEdgePort(slot)).toEqual(['ch', 0]);
		expect(bypassOutputPortIdFromSlot(slot)).toBe('ch');
		expect(parseBypassOutputPortId('ch')).toEqual(slot);
		expect(bypassSlotKey(nodeR, 'ch', 0)).toBe('R.ch@0');
	});

	it('checkpointPortIdForSlot uses bypass encoding only for bypass bases', () => {
		const router = {
			nodeId: 'R',
			bypassPorts: { ch: 'dynamic' },
			bypassConnections: {},
			inputs: {},
			outputs: {},
		} as unknown as RuntimeNode;

		const plain = {
			nodeId: 'P',
			bypassPorts: {},
			inputs: {},
			outputs: {},
		} as unknown as RuntimeNode;

		expect(checkpointPortIdForSlot(router, 'ch', 1)).toBe('ch@1');
		expect(checkpointPortIdForSlot(router, 'ch', 0)).toBe('ch');
		expect(checkpointPortIdForSlot(plain, 'value', 0)).toBe('value');
	});
});
