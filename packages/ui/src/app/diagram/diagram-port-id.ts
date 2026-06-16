import {
	bypassOutputPortId,
	parseBypassOutputPortId,
} from '@langflower/runtime';

export const toInputPortId = (portName: string): string => `in:${portName}`;

export const toOutputPortId = (portName: string): string => `out:${portName}`;

export const fromInputPortId = (portId: string): string =>
	portId.startsWith('in:') ? portId.slice(3) : portId;

export const fromOutputPortId = (portId: string): string =>
	portId.startsWith('out:') ? portId.slice(4) : portId;

/**
 * Canvas handle for a bypass slot — same encoding as runtime
 * {@link bypassOutputPortId} (`ch`, `ch@1`, …). Do not invent a third form.
 */
export const toSlotHandle = bypassOutputPortId;

/** Inverse of {@link toSlotHandle} — runtime {@link parseBypassOutputPortId}. */
export const splitSlotHandle = parseBypassOutputPortId;
