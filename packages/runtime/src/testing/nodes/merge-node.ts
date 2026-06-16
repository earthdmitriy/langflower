import { statefulConnection } from '@rx-evo/stateful-observable';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

export type MergeTestNodeOptions = {
	readonly nodeId: string;
};

/**
 * Merge stand-in — single multi-input `values` port in `merge` mode. Wires are
 * flattened (each source value forwarded individually as it arrives), mirroring
 * the runtime `multyInputGroups` merge branch. The output mirrors the input
 * connection so a test can read the flattened stream.
 */
export function createMergeTestNode(
	options: MergeTestNodeOptions,
): RuntimeNode {
	const { nodeId } = options;
	const values = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'values',
			wireType: 'any',
			mode: 'merge',
		} satisfies PortMeta,
	});
	const value = values.with({
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: { values },
		outputs: { value },
		bypassPorts: {},
	};
}
