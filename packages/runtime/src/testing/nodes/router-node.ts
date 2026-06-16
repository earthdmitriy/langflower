import type { NodeId, RuntimeNode, RuntimeWireType } from '../../types.js';

export type RouterTestNodeOptions = {
	readonly nodeId: string;
	/** Bypass base port → wire type (default `ch` → `dynamic`). */
	readonly bypassPorts?: Record<string, RuntimeWireType>;
};

const DEFAULT_BYPASS_PORTS: Record<string, RuntimeWireType> = {
	ch: 'dynamic' as RuntimeWireType,
};

/** Router stand-in — bypass metadata only; runtime materializes channel IO. */
export function createRouterTestNode(
	options: RouterTestNodeOptions,
): RuntimeNode {
	const { nodeId, bypassPorts = DEFAULT_BYPASS_PORTS } = options;

	return {
		nodeId: nodeId as NodeId,
		inputs: {},
		outputs: {},
		bypassPorts,
	};
}
