import { statefulConnection } from '@rx-evo/stateful-observable';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

export type FinishTestNodeOptions = {
	readonly nodeId: string;
};

/** Passthrough that signals {@link Runtime} to end the run on first output. */
export function createFinishTestNode(
	options: FinishTestNodeOptions,
): RuntimeNode {
	const { nodeId } = options;
	const valueIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const output = valueIn.with({
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: { value: valueIn },
		outputs: { value: output },
		bypassPorts: {},
		stopsRun: true,
		emitOncePerActivation: true,
	};
}
