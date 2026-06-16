import { statefulObservable } from '@rx-evo/stateful-observable';
import { of } from 'rxjs';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

export type ConstantTestNodeOptions = {
	readonly nodeId: string;
	readonly value: string;
};

/** Source node — emits a fixed string on `value` (no inputs). */
export function createConstantTestNode(
	options: ConstantTestNodeOptions,
): RuntimeNode {
	const { nodeId, value } = options;
	const output = statefulObservable({
		loader: () => of(value),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'string',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: {},
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
}
