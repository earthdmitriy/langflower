import { NodeId, RuntimeEdge } from './types.js';

export type EdgeKey = `${string}:${string}→${string}:${string}` & {
	readonly __brand: 'EdgeKey';
};

export type SlotKey = `${string}.${string}@${number}` & {
	readonly __brand: 'SlotKey';
};

export const edgeKey = (edge: Omit<RuntimeEdge, 'edgeId'>): EdgeKey =>
	[
		edge.fromNodeId,
		edge.fromPort.join(':'),
		edge.toNodeId,
		edge.toPort.join(':'),
	].join('→') as EdgeKey;

export const slotKey = (
	nodeId: NodeId,
	portId: string | symbol,
	slotIndex: number,
): SlotKey => `${nodeId}.${String(portId)}@${slotIndex}` as SlotKey;

/** SlotKey from an edge `fromPort` / `toPort` tuple `[portId, slotIndex]`. */
export const edgePortSlotKey = (
	nodeId: NodeId,
	port: readonly [string, number],
): SlotKey => slotKey(nodeId, port[0], port[1]);

export const parseSlotKey = (
	key: SlotKey,
): {
	nodeId: NodeId;
	portId: string;
	slotIndex: number;
} => {
	const atIndex = key.lastIndexOf('@');
	const dotIndex = key.indexOf('.');
	const nodeId = key.slice(0, dotIndex) as NodeId;
	const portId = key.slice(dotIndex + 1, atIndex);
	const slotIndex = Number(key.slice(atIndex + 1));

	return { nodeId, portId, slotIndex };
};
