import { statefulConnection } from '@rx-evo/stateful-observable';
import { map } from 'rxjs';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

export type PreviewTestNodeOptions = {
	readonly nodeId: string;
};

/** Preview stand-in — `text` in → formatted `text` out (passthrough). */
export function createPreviewTestNode(
	options: PreviewTestNodeOptions,
): RuntimeNode {
	const { nodeId } = options;
	const textIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'text',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const text = textIn.pipeValue(map((value) => String(value ?? ''))).with({
		meta: {
			dir: 'out',
			portId: 'text',
			wireType: 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: { text: textIn },
		outputs: { text },
		bypassPorts: {},
	};
}
