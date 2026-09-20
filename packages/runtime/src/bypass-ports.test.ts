import { describe, expect, it } from 'vitest';
import {
	bypassOutputPortId,
	bypassSlot,
	bypassSlotKey,
	checkpointPortIdForSlot,
	parseBypassOutputPortId,
} from './bypass-ports.js';
import { parseSlotKey } from './port-meta.js';
import type { NodeId, RuntimeNode } from './types.js';

const nodeR = 'R' as NodeId;

describe('bypass slot identity', () => {
	it('round-trips edge ↔ outputPortId ↔ SlotKey', () => {
		const slot = bypassSlot('ch', 1);

		expect(slot).toEqual({ basePortId: 'ch', slotIndex: 1 });

		const outputPortId = bypassOutputPortId(
			slot.basePortId,
			slot.slotIndex,
		);
		expect(outputPortId).toBe('ch@1');
		expect(bypassOutputPortId('ch', 1)).toBe('ch@1');
		expect(parseBypassOutputPortId(outputPortId)).toEqual(slot);

		const key = bypassSlotKey(nodeR, slot.basePortId, slot.slotIndex);
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

		expect(bypassOutputPortId(slot.basePortId, slot.slotIndex)).toBe('ch');
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
