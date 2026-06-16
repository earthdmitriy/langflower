import { statefulConnection } from '@rx-evo/stateful-observable';
import { SlotKey, slotKey } from './port-meta.js';
import type {
	NodeId,
	PortMeta,
	RuntimeNode,
	RuntimeWireType,
} from './types.js';

/**
 * Bypass slot identity — one logical slot, three encodings.
 *
 * 1. Edge port tuple: `[basePortId, slotIndex]` (e.g. `['ch', 1]`)
 * 2. Outputs map / checkpoint / telemetry `portId`: `base` or `base@n`
 *    (e.g. `ch@1`) via {@link bypassOutputPortId}
 * 3. {@link SlotKey}: `nodeId.basePortId@slotIndex` (e.g. `R.ch@1`) via
 *    {@link bypassSlotKey} — always the **base** id in the port segment
 *
 * All encode/decode of these forms must go through this module. Do not
 * concatenate `@` at call sites.
 */
export type BypassSlot = {
	readonly basePortId: string;
	readonly slotIndex: number;
};

/** Edge `fromPort` / `toPort` shape for a bypass slot. */
export type BypassEdgePort = readonly [basePortId: string, slotIndex: number];

export const bypassSlot = (
	basePortId: string,
	slotIndex: number,
): BypassSlot => ({
	basePortId,
	slotIndex,
});

export const bypassSlotFromEdgePort = (
	port: readonly [string, number],
): BypassSlot => bypassSlot(port[0], port[1]);

export const bypassEdgePort = (slot: BypassSlot): BypassEdgePort => [
	slot.basePortId,
	slot.slotIndex,
];

/**
 * Checkpoint / outputs-map / tap key for a bypass slot (`ch`, `ch@1`, …).
 * Resume and telemetry must look up snapshots with this id.
 */
export const bypassOutputPortId = (
	basePortId: string,
	slotIndex: number,
): string => (slotIndex === 0 ? basePortId : `${basePortId}@${slotIndex}`);

export const bypassOutputPortIdFromSlot = (slot: BypassSlot): string =>
	bypassOutputPortId(slot.basePortId, slot.slotIndex);

/** Inverse of {@link bypassOutputPortId}. */
export const parseBypassOutputPortId = (outputPortId: string): BypassSlot => {
	const at = outputPortId.lastIndexOf('@');

	if (at > 0) {
		const slotIndex = Number(outputPortId.slice(at + 1));

		if (Number.isInteger(slotIndex) && slotIndex >= 0) {
			return bypassSlot(outputPortId.slice(0, at), slotIndex);
		}
	}

	return bypassSlot(outputPortId, 0);
};

/**
 * SlotKey for a bypass slot — keyed by **base** + index, never by a
 * materialized `ch@n` output id as the portId segment.
 */
export const bypassSlotKey = (
	nodeId: NodeId,
	basePortId: string,
	slotIndex: number,
): SlotKey => slotKey(nodeId, basePortId, slotIndex);

export const bypassSlotKeyFromEdgePort = (
	nodeId: NodeId,
	port: readonly [string, number],
): SlotKey => bypassSlotKey(nodeId, port[0], port[1]);

/**
 * Checkpoint / telemetry portId for a slot. Bypass bases use
 * {@link bypassOutputPortId}; regular ports keep `portId` (slot 0).
 */
export const checkpointPortIdForSlot = (
	node: RuntimeNode,
	portId: string,
	slotIndex: number,
): string =>
	isBypassPort(node, portId) ? bypassOutputPortId(portId, slotIndex) : portId;

/** Single bypass base port id (e.g. `ch` from `{ ch: 'dynamic' }`). */
const getBypassBasePortId = (
	bypassPorts: RuntimeNode['bypassPorts'],
): string | undefined => {
	const portIds = Object.keys(bypassPorts);

	return portIds.length > 0 ? portIds[0] : undefined;
};

const buildBypassConnection = (
	basePortId: string,
	_slotIndex: number,
	wireType: RuntimeWireType,
) => {
	const meta: PortMeta = {
		dir: 'in',
		portId: basePortId,
		wireType,
		mode: 'bypass',
	};

	return statefulConnection<unknown, unknown, PortMeta>({
		meta,
	});
};

/** Materialize slot 0 for each bypass port when a node is added. */
export const materializeBypassNodeOnAdd = (node: RuntimeNode): RuntimeNode => {
	const basePortId = getBypassBasePortId(node.bypassPorts);

	if (basePortId === undefined) {
		return node;
	}

	const wireType = node.bypassPorts[basePortId];

	if (wireType === undefined) {
		return node;
	}

	const connection0 = buildBypassConnection(basePortId, 0, wireType);
	const bypassConnections = {
		...(node.bypassConnections ?? {}),
		[basePortId]: [connection0],
	};

	return {
		...node,
		bypassConnections,
		inputs: {
			...node.inputs,
			[basePortId]: connection0,
		},
		outputs: {
			...node.outputs,
			[basePortId]: connection0,
		},
	};
};

/** Materialize a specific bypass slot (called on addEdge when slotIndex > 0). */
export const materializeBypassSlot = (
	node: RuntimeNode,
	basePortId: string,
	slotIndex: number,
): RuntimeNode => {
	const existing = node.bypassConnections?.[basePortId];

	if (existing !== undefined && existing[slotIndex] !== undefined) {
		return node;
	}

	const wireType = node.bypassPorts[basePortId];

	if (wireType === undefined) {
		return node;
	}

	const connection = buildBypassConnection(basePortId, slotIndex, wireType);
	const connections = [...(existing ?? [])];
	connections[slotIndex] = connection;
	const bypassConnections = {
		...(node.bypassConnections ?? {}),
		[basePortId]: connections,
	};

	const outputPortId = bypassOutputPortId(basePortId, slotIndex);

	return {
		...node,
		bypassConnections,
		outputs: {
			...node.outputs,
			[outputPortId]: connection,
		},
	};
};

/** Check if a portId is a bypass base port. */
export const isBypassPort = (node: RuntimeNode, portId: string): boolean =>
	node.bypassPorts[portId] !== undefined;

/** Get the bypass connection for a specific slot. */
export const getBypassConnection = (
	node: RuntimeNode,
	basePortId: string,
	slotIndex: number,
) => node.bypassConnections?.[basePortId]?.[slotIndex];
